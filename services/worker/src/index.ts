import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import OpenAI from "openai";
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { ClassificationSchema, IngestedMessageSchema, type Classification } from "@deck/contracts";
import { MessageCategory, prisma } from "@deck/database";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const typesafe = new TypeSafeClient();
const MATCH_CONFIDENCE_THRESHOLD = Number(process.env.DISCUSSION_MATCH_THRESHOLD ?? 0.6);
const CANDIDATE_LIMIT = 12;
const NEW_TOPIC = "new_topic";
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

const CLASSIFY_SYSTEM_PROMPT = "Classify a message from a WhatsApp group whose sole purpose is AI-assisted programming and technology topics (coding, tools, infra, models, dev workflows). If an image is attached, look at it and use its actual visual content (code, error, UI, diagram, chart, screenshot, etc.) to inform the classification, title, topic and summary — describe what the image actually shows, not just that an image was sent. Return JSON with category (INCIDENT|TASK|DECISION|KNOWLEDGE|GENERAL_CHAT|NOISE), title, topic, summary, links, assignedTo, isTask. topic is a concise stable theme used to group a conversation; use the same topic for related messages. A question, recommendation, comparison, or conversation seeking an answer is GENERAL_CHAT, not KNOWLEDGE. KNOWLEDGE is only a reusable factual answer, guide, or reference. NOISE means no substance at all, regardless of length: bare acknowledgements/thanks ('ok', 'vale', 'gracias', 'dale'), greetings, emoji-only reactions, or messages fully unrelated to programming/AI/technology. A short message is NOT automatically NOISE if it reports a concrete technical fact, result, tool, model, cost, or experiment (e.g. 'Model X did Y in Z minutes for $W') — that is GENERAL_CHAT or KNOWLEDGE. An opinion, critique, agreement, or disagreement about a technical/AI topic already being discussed in the recent context (e.g. commenting on bias in a shown ranking, disputing a claim, adding a counterpoint) is GENERAL_CHAT, not NOISE, even without hard data — it is a real contribution to the conversation. An image attachment is never NOISE by itself. Do not invent facts.";

async function recentContext(groupId: string, timestamp: Date): Promise<string> {
  const recent = await prisma.deckMessage.findMany({
    where: { groupId, timestamp: { lt: timestamp } },
    orderBy: { timestamp: "desc" },
    take: 4,
    select: { senderName: true, content: true },
  });
  return recent.reverse().map((m) => `${m.senderName}: ${m.content}`).join("\n");
}

async function classify(content: string, imagePath?: string, context?: string): Promise<Classification> {
  const text = context ? `Recent chat messages (oldest to newest, for context — the new message may be an implicit reply to one of these, e.g. answering a question or reacting to something just posted):\n${context}\n\nNew message to classify:\n${content}` : content;
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text }];
  if (imagePath) {
    try {
      const buffer = await readFile(imagePath);
      const ext = path.extname(imagePath).slice(1) || "jpeg";
      userContent.push({ type: "image_url", image_url: { url: `data:image/${ext};base64,${buffer.toString("base64")}` } });
    } catch (error) {
      console.error(`Failed to read image for classification at ${imagePath}:`, error);
    }
  }
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: CLASSIFY_SYSTEM_PROMPT }, { role: "user", content: userContent }],
  });
  return ClassificationSchema.parse(JSON.parse(response.choices[0]?.message.content ?? "{}"));
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
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You maintain a running {title, summary} for an ongoing WhatsApp discussion thread. Given the current title/summary and a new message just added to the thread, return updated JSON {title, summary}. If an image is attached, use its actual visual content to inform the update. title: concise (max 10 words), must reflect the actual purpose/question of the WHOLE thread so far (not just the newest message), in the thread's language. summary: 1-2 sentences covering the thread so far, same language. Keep them stable unless the new message adds meaningful context that changes what the thread is really about." },
      { role: "user", content: userContent },
    ],
  });
  return JSON.parse(response.choices[0]?.message.content ?? "{}");
}

async function matchDiscussion(groupId: string, content: string, context: string) {
  const candidates = await prisma.discussionThread.findMany({
    where: { groupId, status: { in: ["ACTIVE", "PROPOSED"] } },
    orderBy: { lastActivityAt: "desc" },
    take: CANDIDATE_LIMIT,
    select: { id: true, title: true, summary: true },
  });
  if (!candidates.length) return null;
  const criteria: Record<string, string> = { [NEW_TOPIC]: "This message starts a new, unrelated discussion topic." };
  for (const c of candidates) criteria[c.id] = `${c.title}${c.summary ? ` — ${c.summary}` : ""}`.slice(0, 500);
  const state = context ? `Recent chat messages (oldest to newest, for context):\n${context}\n\nNew message to classify:\n${content}` : content;
  const { answers } = await typesafe.systemOne({
    state,
    questions: { match: choice("Which existing discussion does the new message continue? WhatsApp replies are often short and implicit (e.g. naming an alternative, answering a question) without repeating keywords from the topic — use the recent chat context to judge if it's a reply within the same ongoing conversation, not just keyword overlap.", criteria) },
  });
  const { choice: pick, confidence } = answers.match;
  if (pick === NEW_TOPIC || confidence < MATCH_CONFIDENCE_THRESHOLD) return null;
  return candidates.find((c) => c.id === pick) ?? null;
}
async function detectMentions(groupId: string, content: string): Promise<string[]> {
  const handles = [...content.matchAll(/@([\p{L}\p{N}_.]{2,40})/gu)].map((m) => m[1]!.toLowerCase());
  if (!handles.length) return [];
  const senders = await prisma.deckMessage.findMany({ where: { groupId }, distinct: ["senderName"], select: { senderName: true }, take: 500 });
  return senders.map((s) => s.senderName).filter((name) => handles.some((h) => name.toLowerCase().includes(h) || h.includes(name.toLowerCase().replace(/\s+/g, ""))));
}

new Worker("message-enrichment", async (job) => {
  const input = IngestedMessageSchema.parse(job.data);
  const imagePath = input.media?.kind === "IMAGE" ? path.join(MEDIA_DIR, input.media.fileName) : undefined;
  const context = await recentContext(input.groupId, new Date(input.timestamp));
  const classification = await classify(input.content, imagePath, context);
  const category = (input.media && classification.category === "NOISE" ? "GENERAL_CHAT" : classification.category) as MessageCategory;
  await prisma.whatsAppGroup.upsert({
    where: { id: input.groupId },
    create: { id: input.groupId, name: input.groupName },
    update: input.groupName === input.groupId ? {} : { name: input.groupName },
  });
  let isNewDiscussion = false;
  const discussion = category === "NOISE" ? null : await withGroupLock(input.groupId, async () => {
    const matched = await matchDiscussion(input.groupId, input.content, context);
    if (matched) {
      const refreshed = await refreshSummary(matched.title, matched.summary, input.content, imagePath);
      return prisma.discussionThread.update({ where: { id: matched.id }, data: { lastActivityAt: new Date(input.timestamp), title: refreshed.title ?? matched.title, summary: refreshed.summary ?? matched.summary } });
    }
    isNewDiscussion = true;
    return prisma.discussionThread.create({
      data: {
        groupId: input.groupId, topicKey: randomUUID(), title: classification.topic, summary: classification.summary,
        tags: [category], lastActivityAt: new Date(input.timestamp),
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
      metadata: { title: classification.title, topic: classification.topic, summary: classification.summary, links: classification.links, assignedTo: classification.assignedTo, isTask: classification.isTask, media: input.media },
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
