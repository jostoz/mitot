import path from "node:path";
import { ClassificationSchema } from "@deck/contracts";
import { prisma } from "@deck/database";
import OpenAI from "openai";
import { AI_MODELS_KEY, OFF_TOPIC_KEY, classifyMessage, matchDiscussion, offTopicDiscussion, recentContext } from "../discussions.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEDIA_DIR = process.env.MEDIA_STORAGE_DIR ?? path.resolve(process.cwd(), "..", "..", "media-storage");
const dryRun = process.argv.includes("--dry-run");
const groupFilter = process.argv.find((arg) => arg.startsWith("--group="))?.slice("--group=".length);

type Move = { id: string; content: string; from: string; to: string; reason: string };

async function classifyOne(content: string, context: string, imageFileName?: string) {
  const imagePath = imageFileName ? path.join(MEDIA_DIR, imageFileName) : undefined;
  const { raw } = await classifyMessage(openai, content, imagePath, context);
  return ClassificationSchema.parse(JSON.parse(raw));
}


async function retitle(threadId: string) {
  const thread = await prisma.discussionThread.findUnique({
    where: { id: threadId },
    select: { title: true, messages: { orderBy: { timestamp: "asc" }, select: { senderName: true, content: true } } },
  });
  if (!thread?.messages.length) return null;
  const transcript = thread.messages.map((m) => `${m.senderName}: ${m.content}`).join("\n").slice(0, 6000);
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Given the full transcript of a WhatsApp discussion thread, return JSON {title, summary} describing what the thread is actually about. title: max 10 words, in the transcript's language. summary: 1-2 sentences. Base it only on the transcript; do not invent facts.",
      },
      { role: "user", content: transcript },
    ],
  });
  return JSON.parse(response.choices[0]?.message.content ?? "{}") as { title?: string; summary?: string };
}

async function main() {
  const where = groupFilter ? { groupId: groupFilter } : {};
  const messages = await prisma.deckMessage.findMany({
    where,
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      groupId: true,
      content: true,
      category: true,
      timestamp: true,
      parentMessageId: true,
      discussionId: true,
      discussion: { select: { title: true, topicKey: true } },
      media: { select: { fileName: true, kind: true } },
      metadata: true,
    },
  });

  const moves: Move[] = [];
  const touchedThreads = new Set<string>();
  const threadOf = new Map(messages.map((m) => [m.id, m.discussionId]));

  // Paso 1 — la cita de WhatsApp manda: cada respuesta pertenece al hilo de su padre.
  for (const message of messages) {
    if (!message.parentMessageId) continue;
    const parentThreadId = threadOf.get(message.parentMessageId);
    if (!parentThreadId || parentThreadId === message.discussionId) continue;
    const parentThread = await prisma.discussionThread.findUnique({
      where: { id: parentThreadId },
      select: { title: true, topicKey: true },
    });
    if (!parentThread || parentThread.topicKey === OFF_TOPIC_KEY) continue;
    moves.push({
      id: message.id,
      content: message.content,
      from: message.discussion?.title ?? "(sin hilo)",
      to: parentThread.title,
      reason: "cita",
    });
    if (message.discussionId) touchedThreads.add(message.discussionId);
    touchedThreads.add(parentThreadId);
    threadOf.set(message.id, parentThreadId);
    if (!dryRun) {
      await prisma.deckMessage.update({ where: { id: message.id }, data: { discussionId: parentThreadId } });
    }
  }

  // Paso 2 — reclasifica los mensajes sin cita para detectar bromas y ruido con el prompt nuevo.
  // Una imagen nunca es ruido por sí sola: se excluye y se re-empareja en el paso 3.
  const offTopic = await offTopicDiscussion(groupFilter ?? messages[0]!.groupId);
  const citedIds = new Set(messages.map((m) => m.parentMessageId).filter(Boolean) as string[]);
  for (const message of messages) {
    if (message.parentMessageId) continue;
    if (message.media?.kind === "IMAGE") continue;
    if (citedIds.has(message.id)) continue; // alguien lo citó: arrastra conversación, no es ruido
    if (message.discussion?.topicKey === OFF_TOPIC_KEY) continue;
    const meta = message.metadata as { preview?: { siteName?: string; title?: string; description?: string } } | null;
    const preview = meta?.preview;
    const text = preview
      ? `${message.content}\n\nContenido del enlace (${preview.siteName}):\nTítulo: ${preview.title}\nDescripción: ${preview.description}`
      : message.content;
    const context = await recentContext(message.groupId, message.timestamp);
    const result = await classifyOne(text, context, undefined);
    if (result.category !== "NOISE") continue;
    moves.push({
      id: message.id,
      content: message.content,
      from: message.discussion?.title ?? "(sin hilo)",
      to: offTopic.title,
      reason: "sin tema",
    });
    if (message.discussionId) touchedThreads.add(message.discussionId);
    if (!dryRun) {
      await prisma.deckMessage.update({
        where: { id: message.id },
        data: { discussionId: offTopic.id, category: "NOISE" },
      });
    }
  }

  // Paso 3 — re-empareja las imágenes sin cita usando el texto que la visión ya infirió,
  // que es exactamente la señal que el matcher no recibía cuando se clasificaron.
  for (const message of messages) {
    if (message.parentMessageId) continue;
    if (message.media?.kind !== "IMAGE") continue;
    const meta = message.metadata as { title?: string; summary?: string } | null;
    if (!meta?.title && !meta?.summary) continue;
    const described = [message.content, meta.title ? `Título inferido: ${meta.title}` : null, meta.summary ? `Contenido: ${meta.summary}` : null]
      .filter(Boolean)
      .join("\n");
    const context = await recentContext(message.groupId, message.timestamp);
    const matched = (await matchDiscussion(message.groupId, described, context)).thread;
    if (!matched || matched.id === message.discussionId) continue;
    moves.push({
      id: message.id,
      content: `${message.content} (${meta.title})`,
      from: message.discussion?.title ?? "(sin hilo)",
      to: matched.title,
      reason: "imagen re-emparejada",
    });
    if (message.discussionId) touchedThreads.add(message.discussionId);
    touchedThreads.add(matched.id);
    if (!dryRun) {
      await prisma.deckMessage.update({ where: { id: message.id }, data: { discussionId: matched.id } });
    }
  }

  for (const move of moves) {
    console.log(`[${move.reason}] "${move.content.replace(/\n/g, " ").slice(0, 44)}"`);
    console.log(`        ${move.from}  →  ${move.to}`);
  }

  for (const threadId of touchedThreads) {
    const remaining = await prisma.deckMessage.count({ where: { discussionId: threadId } });
    const thread = await prisma.discussionThread.findUnique({ where: { id: threadId }, select: { title: true, topicKey: true } });
    const isConstant = thread?.topicKey === OFF_TOPIC_KEY || thread?.topicKey === AI_MODELS_KEY;
    if (!remaining && !isConstant) {
      console.log(`[vacío] se elimina "${thread?.title}"`);
      if (!dryRun) {
        await prisma.notification.deleteMany({ where: { discussionId: threadId } });
        await prisma.discussionThread.delete({ where: { id: threadId } });
      }
      continue;
    }
    if (!remaining) continue; // hilo constante sin mensajes: se conserva
    const before = thread;
    const rewritten = dryRun ? null : await retitle(threadId);
    if (rewritten?.title) {
      console.log(`[retítulo] "${before?.title}"  →  "${rewritten.title}"`);
      await prisma.discussionThread.update({
        where: { id: threadId },
        data: { title: rewritten.title, summary: rewritten.summary ?? undefined },
      });
    } else if (dryRun) {
      console.log(`[retítulo] "${before?.title}" (${remaining} mensajes) se recalcularía`);
    }
  }

  console.log(`\n${dryRun ? "[dry-run] " : ""}movidos: ${moves.length} · hilos afectados: ${touchedThreads.size}`);
  await prisma.$disconnect();
}

await main();
process.exit(0);
