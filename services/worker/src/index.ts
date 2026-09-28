import { randomUUID } from "node:crypto";
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

const groupLocks = new Map<string, Promise<unknown>>();
function withGroupLock<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const prior = groupLocks.get(groupId) ?? Promise.resolve();
  const settled = prior.catch(() => {});
  const next = settled.then(fn);
  groupLocks.set(groupId, next.catch(() => {}));
  return next;
}

async function classify(content: string): Promise<Classification> {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: "Classify a message from a WhatsApp group whose sole purpose is AI-assisted programming and technology topics (coding, tools, infra, models, dev workflows). Return JSON with category (INCIDENT|TASK|DECISION|KNOWLEDGE|GENERAL_CHAT|NOISE), title, topic, summary, links, assignedTo, isTask. topic is a concise stable theme used to group a conversation; use the same topic for related messages. A question, recommendation, comparison, or conversation seeking an answer is GENERAL_CHAT, not KNOWLEDGE. KNOWLEDGE is only a reusable factual answer, guide, or reference. NOISE means no substance at all, regardless of length: bare acknowledgements/thanks ('ok', 'vale', 'gracias', 'dale'), greetings, emoji-only reactions, or messages fully unrelated to programming/AI/technology. A short message is NOT automatically NOISE if it reports a concrete technical fact, result, tool, model, cost, or experiment (e.g. 'Model X did Y in Z minutes for $W') — that is GENERAL_CHAT or KNOWLEDGE. Do not invent facts." }, { role: "user", content }],
  });
  return ClassificationSchema.parse(JSON.parse(response.choices[0]?.message.content ?? "{}"));
}

async function refreshSummary(currentTitle: string, currentSummary: string | null, newMessage: string): Promise<{ title: string; summary: string }> {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You maintain a running {title, summary} for an ongoing WhatsApp discussion thread. Given the current title/summary and a new message just added to the thread, return updated JSON {title, summary}. title: concise (max 10 words), must reflect the actual purpose/question of the WHOLE thread so far (not just the newest message), in the thread's language. summary: 1-2 sentences covering the thread so far, same language. Keep them stable unless the new message adds meaningful context that changes what the thread is really about." },
      { role: "user", content: JSON.stringify({ currentTitle, currentSummary, newMessage }) },
    ],
  });
  return JSON.parse(response.choices[0]?.message.content ?? "{}");
}

async function matchDiscussion(groupId: string, content: string, timestamp: Date) {
  const [candidates, recent] = await Promise.all([
    prisma.discussionThread.findMany({
      where: { groupId, status: { in: ["ACTIVE", "PROPOSED"] } },
      orderBy: { lastActivityAt: "desc" },
      take: CANDIDATE_LIMIT,
      select: { id: true, title: true, summary: true },
    }),
    prisma.deckMessage.findMany({
      where: { groupId, timestamp: { lt: timestamp } },
      orderBy: { timestamp: "desc" },
      take: 4,
      select: { senderName: true, content: true },
    }),
  ]);
  if (!candidates.length) return null;
  const criteria: Record<string, string> = { [NEW_TOPIC]: "This message starts a new, unrelated discussion topic." };
  for (const c of candidates) criteria[c.id] = `${c.title}${c.summary ? ` — ${c.summary}` : ""}`.slice(0, 500);
  const context = recent.reverse().map((m) => `${m.senderName}: ${m.content}`).join("\n");
  const state = context ? `Recent chat messages (oldest to newest, for context):\n${context}\n\nNew message to classify:\n${content}` : content;
  const { answers } = await typesafe.systemOne({
    state,
    questions: { match: choice("Which existing discussion does the new message continue? WhatsApp replies are often short and implicit (e.g. naming an alternative, answering a question) without repeating keywords from the topic — use the recent chat context to judge if it's a reply within the same ongoing conversation, not just keyword overlap.", criteria) },
  });
  const { choice: pick, confidence } = answers.match;
  if (pick === NEW_TOPIC || confidence < MATCH_CONFIDENCE_THRESHOLD) return null;
  return candidates.find((c) => c.id === pick) ?? null;
}
new Worker("message-enrichment", async (job) => {
  const input = IngestedMessageSchema.parse(job.data);
  const classification = await classify(input.content);
  const category = classification.category as MessageCategory;
  await prisma.whatsAppGroup.upsert({
    where: { id: input.groupId },
    create: { id: input.groupId, name: input.groupName },
    update: input.groupName === input.groupId ? {} : { name: input.groupName },
  });
  const discussion = category === "NOISE" ? null : await withGroupLock(input.groupId, async () => {
    const matched = await matchDiscussion(input.groupId, input.content, new Date(input.timestamp));
    if (matched) {
      const refreshed = await refreshSummary(matched.title, matched.summary, input.content);
      return prisma.discussionThread.update({ where: { id: matched.id }, data: { lastActivityAt: new Date(input.timestamp), title: refreshed.title ?? matched.title, summary: refreshed.summary ?? matched.summary } });
    }
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
      metadata: { title: classification.title, topic: classification.topic, summary: classification.summary, links: classification.links, assignedTo: classification.assignedTo, isTask: classification.isTask, audioUrl: input.audioUrl },
    },
    update: {},
  });
  await redis.publish("deck-events", JSON.stringify({ type: "message.created", message: { ...saved, timestamp: saved.timestamp.toISOString() } }));
}, { connection: redis, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) });

process.once("SIGINT", async () => { await Promise.all([prisma.$disconnect(), redis.quit()]); process.exit(0); });
