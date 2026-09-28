import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
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
const DiscussionUpdateSchema = z.object({ status: z.enum(["PROPOSED", "ACTIVE", "RESOLVED", "ARCHIVED"]).optional(), ownerName: z.string().trim().min(1).max(120).nullable().optional(), nextAction: z.string().trim().min(1).max(4096).nullable().optional(), followUpAt: z.coerce.date().nullable().optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).nullable().optional() }).refine((value) => Object.keys(value).length > 0);
const ManualMessageSchema = z.object({
  senderName: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4096),
  timestamp: z.coerce.date().optional(),
});

await app.register(cors, { origin: process.env.WEB_ORIGIN?.split(",") ?? true });
await app.register(websocket);

app.get("/health", async () => ({ ok: true }));
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
app.get("/public/groups/:groupId/discussions", async (request) => {
  const { groupId } = request.params as { groupId: string };
  return prisma.$queryRaw`SELECT id, title, summary, "lastActivityAt" FROM "DiscussionThread" WHERE "groupId" = ${groupId} AND visibility = 'PUBLIC' ORDER BY "lastActivityAt" DESC`;
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
  return reply.send(await prisma.discussionThread.update({ where: { id }, data }));
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
