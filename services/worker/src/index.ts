import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import OpenAI from "openai";
import { ClassificationSchema, IngestedMessageSchema, type Classification } from "@deck/contracts";
import { MessageCategory, prisma } from "@deck/database";
import { extractUrls, unfurl } from "./unfurl.js";
import { classifyMessage, aiModelsDiscussion, AI_MODELS_TITLE, isModelComparison, matchDiscussion, offTopicDiscussion, recentContext, PROMPT_VERSION, UNRESOLVED_REPLY_KEY, unresolvedReplyDiscussion } from "./discussions.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COLUMN_TITLES: Record<string, string> = { INCIDENT: "🛠️ Problemas técnicos", TASK: "🚀 Proyectos y colaboraciones", DECISION: "📣 Decisiones de comunidad", KNOWLEDGE: "📚 Recursos y referencias", GENERAL_CHAT: "💬 Hilos abiertos", NOISE: "🔇 Noise" };
const MEDIA_DIR = process.env.MEDIA_STORAGE_DIR ?? path.resolve(process.cwd(), "..", "..", "media-storage");

const groupLocks = new Map<string, Promise<unknown>>();
function withGroupLock<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const prior = groupLocks.get(groupId) ?? Promise.resolve();
  const settled = prior.catch(() => {});
  const next = settled.then(fn);
  groupLocks.set(groupId, next.catch(() => {}));
  return next;
}


/** Un mensaje citado en WhatsApp es una señal determinista: pertenece al hilo del mensaje citado. */
async function discussionFromReply(parentMessageId: string | undefined) {
  if (!parentMessageId) return null;
  const parent = await prisma.deckMessage.findUnique({
    where: { id: parentMessageId },
    select: { discussion: { select: { id: true, title: true, summary: true, lastActivityAt: true } } },
  });
  return parent?.discussion ?? null;
}

function latestActivityAt(current: Date, incoming: Date) {
  return current >= incoming ? current : incoming;
}


async function classify(content: string, imagePath?: string, context?: string): Promise<Classification> {
  const { raw } = await classifyMessage(openai, content, imagePath, context);
  return ClassificationSchema.parse(JSON.parse(raw));
}

async function refreshSummary(currentTitle: string, currentSummary: string | null, newMessage: string, imagePath?: string): Promise<{ title: string; summary: string }> {
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: JSON.stringify({ currentTitle, currentSummary, newMessage }) }];
  if (imagePath) {
    try {
      const buffer = await readFile(imagePath);
      const ext = path.extname(imagePath).slice(1) || "jpeg";
      userContent.push({ type: "image_url", image_url: { url: `data:image/${ext};base64,${buffer.toString("base64")}` } });
    } catch (error) {
      console.error(`Failed to read image for summary refresh at ${imagePath}:`, error);
    }
  }
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You maintain a running {title, summary} for an ongoing WhatsApp discussion thread. Given the current title/summary and a new message just added to the thread, return updated JSON {title, summary}. If an image is attached, use its actual visual content to inform the update. title: concise (max 10 words), must reflect the actual purpose/question of the WHOLE thread so far (not just the newest message), in the thread's language. summary: 1-2 sentences covering the thread so far, same language. Keep them stable unless the new message adds meaningful context that changes what the thread is really about." },
      { role: "user", content: userContent },
    ],
  });
  return JSON.parse(response.choices[0]?.message.content ?? "{}");
}

async function detectMentions(groupId: string, content: string): Promise<string[]> {
  const handles = [...content.matchAll(/@([\p{L}\p{N}_.]{2,40})/gu)].map((m) => m[1]!.toLowerCase());
  if (!handles.length) return [];
  const senders = await prisma.deckMessage.findMany({ where: { groupId }, distinct: ["senderName"], select: { senderName: true }, take: 500 });
  return senders.map((s) => s.senderName).filter((name) => handles.some((h) => name.toLowerCase().includes(h) || h.includes(name.toLowerCase().replace(/\s+/g, ""))));
}

new Worker("message-enrichment", async (job) => {
  const input = IngestedMessageSchema.parse(job.data);
  // `append` puede repetir un mensaje ya entregado al reconectar WhatsApp. No vuelvas a
  // clasificarlo ni a crear efectos secundarios; DeckMessage es el registro duradero.
  if (await prisma.deckMessage.findUnique({ where: { id: input.id }, select: { id: true } })) return;
  const messageAt = new Date(input.timestamp);
  const imagePath = input.media?.kind === "IMAGE" ? path.join(MEDIA_DIR, input.media.fileName) : undefined;
  const context = await recentContext(input.groupId, messageAt);
  const [firstUrl] = extractUrls(input.content);
  const preview = firstUrl ? await unfurl(firstUrl, MEDIA_DIR) : null;
  const contentForModel = preview
    ? `${input.content}\n\nContenido del enlace ${preview.url} (${preview.siteName}):\nTítulo: ${preview.title ?? "(sin título)"}\nDescripción: ${preview.description ?? "(sin descripción)"}`
    : input.content;
  const classification = await classify(contentForModel, imagePath, context);
  const category = (input.media && classification.category === "NOISE" ? "GENERAL_CHAT" : classification.category) as MessageCategory;
  await prisma.whatsAppGroup.upsert({
    where: { id: input.groupId },
    create: { id: input.groupId, name: input.groupName },
    update: input.groupName === input.groupId ? {} : { name: input.groupName },
  });
  // Candidato constante para matchDiscussion: existe desde el primer mensaje del grupo,
  // no se crea perezosamente al primer mensaje sobre modelos (evitaría que ese primer
  // mensaje abriera un hilo ad-hoc en vez de aterrizar aquí).
  await aiModelsDiscussion(input.groupId);
  const parentDiscussion = await discussionFromReply(input.parentMessageId);
  const describedMessage = [
    input.content,
    classification.title && classification.title !== "Untitled" ? `Título inferido: ${classification.title}` : null,
    classification.summary ? `Contenido: ${classification.summary}` : null,
    input.media && !imagePath ? `Adjunto: ${input.media.kind.toLowerCase()}` : null,
    imagePath ? "Adjunto: captura de pantalla (descrita arriba)" : null,
  ]
    .filter(Boolean)
    .join("\n");

  let isNewDiscussion = false;
  let matchMethod: "citation" | "typesafe" | "noise" | "model_comparison" | "unresolved_reply" = "typesafe";
  let matchConfidence = 1;
  let matchCandidateCount = 0;
  let matchIsNewTopic = false;
  const discussion = category === "NOISE"
    ? ((matchMethod = "noise"), await offTopicDiscussion(input.groupId, messageAt))
    : await withGroupLock(input.groupId, async () => {
        if (parentDiscussion) {
          matchMethod = "citation";
          const refreshed = await refreshSummary(parentDiscussion.title, parentDiscussion.summary, describedMessage, imagePath);
          return prisma.discussionThread.update({
            where: { id: parentDiscussion.id },
            data: { lastActivityAt: latestActivityAt(parentDiscussion.lastActivityAt, messageAt), title: refreshed.title ?? parentDiscussion.title, summary: refreshed.summary ?? parentDiscussion.summary },
          });
        }
        if (input.parentMessageId) {
          // El historial puede traer una respuesta sin su padre. Forzar un match semántico
          // aquí inventa una relación; se conserva aparte y se adopta al llegar el padre.
          matchMethod = "unresolved_reply";
          matchConfidence = 1;
          const unresolved = await unresolvedReplyDiscussion(input.groupId, messageAt);
          return prisma.discussionThread.update({
            where: { id: unresolved.id },
            data: { lastActivityAt: latestActivityAt(unresolved.lastActivityAt, messageAt) },
          });
        }
        if (isModelComparison(input.content)) {
          matchMethod = "model_comparison";
          matchConfidence = 1;
          matchCandidateCount = 1;
          const models = await aiModelsDiscussion(input.groupId);
          const refreshed = await refreshSummary(models.title, models.summary, describedMessage, imagePath);
          return prisma.discussionThread.update({
            where: { id: models.id },
            data: { lastActivityAt: latestActivityAt(models.lastActivityAt, messageAt), title: AI_MODELS_TITLE, summary: refreshed.summary ?? models.summary },
          });
        }
        const result = await matchDiscussion(input.groupId, describedMessage, context);
        matchConfidence = result.confidence;
        matchCandidateCount = result.candidateCount;
        matchIsNewTopic = result.thread === null;
        if (result.thread) {
          const refreshed = await refreshSummary(result.thread.title, result.thread.summary, describedMessage, imagePath);
          return prisma.discussionThread.update({
            where: { id: result.thread.id },
            data: { lastActivityAt: latestActivityAt(result.thread.lastActivityAt, messageAt), title: refreshed.title ?? result.thread.title, summary: refreshed.summary ?? result.thread.summary },
          });
        }
        isNewDiscussion = true;
        return prisma.discussionThread.create({
          data: {
            groupId: input.groupId, topicKey: randomUUID(), title: classification.topic, summary: classification.summary,
            tags: [category], lastActivityAt: messageAt,
          },
        });
      });
  const column = await prisma.deckColumn.upsert({
    where: { groupId_slug: { groupId: input.groupId, slug: category.toLowerCase() } },
    create: { groupId: input.groupId, slug: category.toLowerCase(), title: COLUMN_TITLES[category], category },
    update: {},
  });
  const saved = await prisma.deckMessage.upsert({
    where: { id: input.id },
    create: {
      id: input.id, groupId: input.groupId, columnId: column.id, discussionId: discussion?.id ?? null, senderJid: input.senderJid, senderName: input.senderName,
      content: input.content, category, parentMessageId: input.parentMessageId, isOutbound: input.isOutbound, timestamp: new Date(input.timestamp),
      metadata: { title: classification.title, topic: classification.topic, summary: classification.summary, links: classification.links, assignedTo: classification.assignedTo, isTask: classification.isTask, media: input.media, preview },
    },
    update: {},
  });
  if (input.media) {
    await prisma.mediaAsset.upsert({
      where: { messageId: saved.id },
      create: { messageId: saved.id, kind: input.media.kind, mimeType: input.media.mimeType, fileName: input.media.fileName, sizeBytes: input.media.sizeBytes },
      update: {},
    });
  }

  // Si el padre llegó después, mueve sus respuestas recuperadas desde el bucket temporal
  // al hilo real antes de publicar el evento que hará al cliente recargar el snapshot.
  if (discussion && discussion.topicKey !== UNRESOLVED_REPLY_KEY) {
    const unresolvedReplies = await prisma.deckMessage.findMany({
      where: { parentMessageId: saved.id, discussion: { topicKey: UNRESOLVED_REPLY_KEY } },
      select: { id: true, timestamp: true },
    });
    if (unresolvedReplies.length) {
      await prisma.deckMessage.updateMany({
        where: { id: { in: unresolvedReplies.map((reply) => reply.id) } },
        data: { discussionId: discussion.id },
      });
      const latestReplyAt = unresolvedReplies.reduce((latest, reply) => latestActivityAt(latest, reply.timestamp), discussion.lastActivityAt);
      await prisma.discussionThread.update({ where: { id: discussion.id }, data: { lastActivityAt: latestReplyAt } });
    }
  }
  await prisma.matchDecision.upsert({
    where: { messageId: saved.id },
    create: {
      groupId: input.groupId, messageId: saved.id, promptVersion: PROMPT_VERSION, method: matchMethod, category,
      matchedThreadId: discussion?.id ?? null, isNewTopic: matchIsNewTopic, confidence: matchConfidence, candidateCount: matchCandidateCount,
    },
    update: {},
  });
  await redis.publish("deck-events", JSON.stringify({ type: "message.created", message: { ...saved, timestamp: saved.timestamp.toISOString() } }));

  if (isNewDiscussion && discussion) {
    const notification = await prisma.notification.create({
      data: { groupId: input.groupId, type: "NEW_DISCUSSION", title: `Nueva discusión: ${discussion.title}`, body: discussion.summary, discussionId: discussion.id },
    });
    await redis.publish("deck-events", JSON.stringify({ type: "notification.created", notification: { ...notification, createdAt: notification.createdAt.toISOString() } }));
  }
  if (discussion && category !== "NOISE") {
    const mentioned = await detectMentions(input.groupId, input.content);
    for (const name of mentioned) {
      const notification = await prisma.notification.create({
        data: { groupId: input.groupId, type: "MENTION", title: `${input.senderName} mencionó a ${name}`, body: input.content.slice(0, 280), discussionId: discussion.id },
      });
      await redis.publish("deck-events", JSON.stringify({ type: "notification.created", notification: { ...notification, createdAt: notification.createdAt.toISOString() } }));
    }
  }
}, { connection: redis, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) });

setInterval(async () => {
  try {
    const due = await prisma.discussionThread.findMany({ where: { followUpAt: { lte: new Date() }, status: "ACTIVE" }, select: { id: true, groupId: true, title: true, nextAction: true } });
    for (const d of due) {
      const notification = await prisma.notification.create({
        data: { groupId: d.groupId, type: "FOLLOW_UP_DUE", title: `Follow-up vencido: ${d.title}`, body: d.nextAction, discussionId: d.id },
      });
      await prisma.discussionThread.update({ where: { id: d.id }, data: { followUpAt: null } });
      await redis.publish("deck-events", JSON.stringify({ type: "notification.created", notification: { ...notification, createdAt: notification.createdAt.toISOString() } }));
    }
  } catch (error) {
    console.error("Follow-up due check failed:", error);
  }
}, 60_000);

process.once("SIGINT", async () => { await Promise.all([prisma.$disconnect(), redis.quit()]); process.exit(0); });
