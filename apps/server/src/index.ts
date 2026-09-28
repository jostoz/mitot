import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Redis } from "ioredis";
import { z } from "zod";
import { prisma } from "@deck/database";

const app = Fastify({ logger: true });
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const outbound = new Queue("whatsapp-outbound", { connection: redis });
const enrichment = new Queue("message-enrichment", { connection: redis });
const clients = new Set<{ send(data: string): void; readyState: number }>();
const ReplySchema = z.object({ content: z.string().trim().min(1).max(4096), parentMessageId: z.string().min(1).optional() });
const DiscussionUpdateSchema = z.object({ status: z.enum(["PROPOSED", "ACTIVE"]).optional(), visibility: z.enum(["PRIVATE", "MEMBERS", "PUBLIC"]).optional(), ownerName: z.string().trim().min(1).max(120).nullable().optional(), nextAction: z.string().trim().min(1).max(4096).nullable().optional(), followUpAt: z.coerce.date().nullable().optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).nullable().optional() }).refine((value) => Object.keys(value).length > 0);
const MessageRouteSchema = z.object({
  discussionId: z.string().min(1).nullable(),
  correctedBy: z.string().trim().min(1).max(120).optional(),
});
const ManualMessageSchema = z.object({
  senderName: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4096),
  timestamp: z.coerce.date().optional(),
});

await app.register(cors, { origin: process.env.WEB_ORIGIN?.split(",") ?? true });
await app.register(websocket);
await app.register(staticPlugin, { root: process.env.MEDIA_STORAGE_DIR ?? path.resolve(process.cwd(), "..", "..", "media-storage"), prefix: "/media/" });
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: "Invalid request", issues: error.issues });
  return reply.send(error);
});

app.get("/health", async () => ({ ok: true }));
app.get("/ingest-status", async (_request, reply) => {
  try {
    const url = process.env.INGEST_STATUS_URL ?? "http://127.0.0.1:3002/status";
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return reply.send(await res.json());
  } catch {
    return reply.send({ state: "unreachable", connectedAt: null, lastMessageAt: null, lastCloseReason: null, reconnects: null });
  }
});
app.get("/groups", async () => prisma.whatsAppGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { columns: { orderBy: { createdAt: "asc" } } } }));
app.get("/groups/:groupId/messages", async (request) => {
  const { groupId } = request.params as { groupId: string };
  const query = request.query as { cursor?: string; limit?: string };
  const limit = Math.min(Math.max(Number(query.limit ?? 100), 1), 200);
  const messages = await prisma.deckMessage.findMany({ where: { groupId }, orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
  const next = messages.length > limit ? messages.pop()?.id : undefined;
  return { messages, nextCursor: next };
});
app.get("/groups/:groupId/discussions", async (request) => {
  const { groupId } = request.params as { groupId: string };
  return prisma.discussionThread.findMany({
    where: { groupId },
    orderBy: { lastActivityAt: "desc" },
    include: { messages: { orderBy: [{ timestamp: "asc" }, { id: "asc" }] } },
  });
});
app.get("/public/groups/:groupId/discussions", async (request, reply) => {
  const { groupId } = request.params as { groupId: string };
  const group = await prisma.whatsAppGroup.findUnique({ where: { id: groupId }, select: { name: true, isActive: true } });
  if (!group?.isActive) return reply.code(404).send({ error: "Group not found" });
  const discussions = await prisma.discussionThread.findMany({
    where: { groupId, visibility: "PUBLIC" },
    orderBy: { lastActivityAt: "desc" },
    select: {
      id: true,
      title: true,
      summary: true,
      lastActivityAt: true,
      // Sin nombres de remitente: la página es pública y el grupo no consintió exponerlos.
      messages: { orderBy: { timestamp: "asc" }, select: { id: true, content: true, timestamp: true, metadata: true } },
    },
  });
  return reply.send({ group: { name: group.name }, discussions });
});
app.post("/groups/:groupId/replies", async (request, reply) => {
  const { groupId } = request.params as { groupId: string };
  const payload = ReplySchema.parse(request.body);
  const group = await prisma.whatsAppGroup.findUnique({ where: { id: groupId }, select: { id: true, isActive: true } });
  if (!group?.isActive) return reply.code(404).send({ error: "Active WhatsApp group not found" });
  const job = await outbound.add("send", { groupId, ...payload }, { removeOnComplete: 1000, removeOnFail: 5000 });
  return reply.code(202).send({ id: job.id });
});
app.post("/groups/:groupId/manual-messages", async (request, reply) => {
  const { groupId } = request.params as { groupId: string };
  const payload = ManualMessageSchema.parse(request.body);
  const group = await prisma.whatsAppGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true, isActive: true } });
  if (!group?.isActive) return reply.code(404).send({ error: "Active WhatsApp group not found" });
  const id = `manual-${randomUUID()}`;
  const timestamp = (payload.timestamp ?? new Date()).toISOString();
  await enrichment.add("enrich", {
    id, groupId, groupName: group.name, senderJid: `manual:${payload.senderName.toLowerCase().replace(/\s+/g, "-")}`,
    senderName: payload.senderName, content: payload.content, isOutbound: false, timestamp,
  }, { jobId: id, removeOnComplete: 1000, removeOnFail: 5000 });
  return reply.code(202).send({ id });
});
app.patch("/discussions/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const data = DiscussionUpdateSchema.parse(request.body);
  if (data.visibility === "PUBLIC") {
    const thread = await prisma.discussionThread.findUnique({ where: { id }, select: { topicKey: true } });
    // El bucket de ruido acumula bromas y reacciones: publicarlo expone al grupo sin aportar valor.
    if (thread?.topicKey === "off-topic") {
      return reply.code(400).send({ error: "El hilo sin tema no puede publicarse" });
    }
  }
  return reply.send(await prisma.discussionThread.update({ where: { id }, data }));
});
app.patch("/messages/:id/discussion", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { discussionId, correctedBy } = MessageRouteSchema.parse(request.body);
  const message = await prisma.deckMessage.findUnique({
    where: { id },
    select: { id: true, groupId: true, discussionId: true },
  });
  if (!message) return reply.code(404).send({ error: "Message not found" });

  if (discussionId) {
    const target = await prisma.discussionThread.findUnique({ where: { id: discussionId }, select: { groupId: true } });
    if (!target) return reply.code(404).send({ error: "Discussion not found" });
    if (target.groupId !== message.groupId) return reply.code(400).send({ error: "Discussion belongs to another group" });
  }

  const [updated] = await prisma.$transaction([
    prisma.deckMessage.update({ where: { id }, data: { discussionId } }),
    prisma.routingCorrection.create({
      data: { groupId: message.groupId, messageId: id, fromThreadId: message.discussionId, toThreadId: discussionId, correctedBy },
    }),
  ]);

  // El hilo de origen puede quedar vacío tras mover su último mensaje.
  if (message.discussionId && message.discussionId !== discussionId) {
    const remaining = await prisma.deckMessage.count({ where: { discussionId: message.discussionId } });
    if (!remaining) {
      await prisma.notification.deleteMany({ where: { discussionId: message.discussionId } });
      await prisma.routingCorrection.updateMany({ where: { toThreadId: message.discussionId }, data: { toThreadId: null } });
      await prisma.discussionThread.delete({ where: { id: message.discussionId } });
    }
  }
  if (discussionId) {
    await prisma.discussionThread.update({ where: { id: discussionId }, data: { lastActivityAt: new Date() } });
  }

  await redis.publish("deck-events", JSON.stringify({ type: "message.rerouted", messageId: id }));
  return reply.send(updated);
});
app.get("/groups/:groupId/observability", async (request) => {
  const { groupId } = request.params as { groupId: string };
  const [decisions, corrections] = await Promise.all([
    prisma.matchDecision.findMany({
      where: { groupId },
      select: { messageId: true, promptVersion: true, method: true, category: true, isNewTopic: true, confidence: true },
    }),
    prisma.routingCorrection.findMany({ where: { groupId }, select: { messageId: true } }),
  ]);
  const correctedIds = new Set(corrections.map((c) => c.messageId));

  type Bucket = {
    total: number;
    correctedCount: number;
    confidenceSum: number;
    confidenceCount: number;
    newTopicCount: number;
    typesafeCount: number;
    methodCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
  };
  const byVersion = new Map<string, Bucket>();
  for (const d of decisions) {
    const bucket = byVersion.get(d.promptVersion) ?? {
      total: 0, correctedCount: 0, confidenceSum: 0, confidenceCount: 0, newTopicCount: 0, typesafeCount: 0, methodCounts: {}, categoryCounts: {},
    };
    bucket.total += 1;
    if (correctedIds.has(d.messageId)) bucket.correctedCount += 1;
    bucket.methodCounts[d.method] = (bucket.methodCounts[d.method] ?? 0) + 1;
    bucket.categoryCounts[d.category] = (bucket.categoryCounts[d.category] ?? 0) + 1;
    if (d.method === "typesafe") {
      bucket.typesafeCount += 1;
      if (d.confidence != null) {
        bucket.confidenceSum += d.confidence;
        bucket.confidenceCount += 1;
      }
      if (d.isNewTopic) bucket.newTopicCount += 1;
    }
    byVersion.set(d.promptVersion, bucket);
  }

  const versions = [...byVersion.entries()]
    .map(([promptVersion, b]) => ({
      promptVersion,
      total: b.total,
      correctedCount: b.correctedCount,
      overrideRate: b.total ? b.correctedCount / b.total : 0,
      avgConfidence: b.confidenceCount ? b.confidenceSum / b.confidenceCount : null,
      newTopicRate: b.typesafeCount ? b.newTopicCount / b.typesafeCount : null,
      methodCounts: b.methodCounts,
      categoryCounts: b.categoryCounts,
    }))
    .sort((a, b) => b.total - a.total);
  return { versions };
});
app.get("/groups/:groupId/notifications", async (request) => {
  const { groupId } = request.params as { groupId: string };
  const query = request.query as { unreadOnly?: string };
  return prisma.notification.findMany({
    where: { groupId, ...(query.unreadOnly === "true" ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
});
app.patch("/notifications/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  return reply.send(await prisma.notification.update({ where: { id }, data: { read: true } }));
});
app.get("/events", { websocket: true }, (socket) => {
  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

await subscriber.subscribe("deck-events");
subscriber.on("message", (_channel, payload) => {
  for (const client of clients) if (client.readyState === 1) client.send(payload);
});

const close = async () => { await Promise.all([app.close(), outbound.close(), enrichment.close(), redis.quit(), subscriber.quit(), prisma.$disconnect()]); };
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
await app.listen({ host: process.env.HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3001) });
