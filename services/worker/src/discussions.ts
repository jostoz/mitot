import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { prisma } from "@deck/database";
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

/**
 * Bump esto a mano cada vez que CLASSIFY_SYSTEM_PROMPT, IMAGE_DESCRIBE_PROMPT o la lógica
 * de matchDiscussion cambien de forma que pueda afectar la calidad del enrutado. Es lo que
 * permite comparar la tasa de corrección manual (RoutingCorrection) entre versiones sin
 * tener que adivinar si un cambio de prompt ayudó o empeoró las cosas.
 */
export const PROMPT_VERSION = "2026-09-28-model-comparison-routing";
export const CLASSIFY_SYSTEM_PROMPT =
  "Classify a message from a WhatsApp group whose sole purpose is AI-assisted programming and technology topics (coding, tools, infra, models, dev workflows). If an image is attached, look at it and use its actual visual content (code, error, UI, diagram, chart, screenshot, etc.) to inform the classification, title, topic and summary — describe what the image actually shows, not just that an image was sent. Return JSON with category (INCIDENT|TASK|DECISION|KNOWLEDGE|GENERAL_CHAT|NOISE), title, topic, summary, links, assignedTo, isTask. topic is a concise stable theme used to group a conversation; use the same topic for related messages. A question, recommendation, comparison, or conversation seeking an answer is GENERAL_CHAT, not KNOWLEDGE. KNOWLEDGE is only a reusable factual answer, guide, or reference. NOISE means no substance at all, regardless of length: bare acknowledgements/thanks ('ok', 'vale', 'gracias', 'dale'), greetings, emoji-only reactions, or messages fully unrelated to programming/AI/technology. Banter, jokes, memes and pure amusement are NOISE even when they quote or link something technical: if the message adds no claim, question, fact or opinion of its own and exists only to laugh or react (laughter strings like 'jajaja', 'lol', mockery, crude jokes, 'look at this lol'), classify it NOISE regardless of what the linked page says — judge the sender's own words, not the link's content. A short message is NOT automatically NOISE if it reports a concrete technical fact, result, tool, model, cost, or experiment (e.g. 'Model X did Y in Z minutes for $W') — that is GENERAL_CHAT or KNOWLEDGE. An opinion, critique, agreement, or disagreement about a technical/AI topic already being discussed in the recent context (e.g. commenting on bias in a shown ranking, disputing a claim, adding a counterpoint) is GENERAL_CHAT, not NOISE, even without hard data — it is a real contribution to the conversation. An image attachment is never NOISE by itself. When an image is attached, the summary MUST name the concrete entities visible in it verbatim: product/model/tool/brand names, version numbers, tiers or positions in a ranking (and which item sits where), error text, metrics and figures. Write what a reader who cannot see the image would need to react to it, including anything surprising or contentious about the arrangement. Do not invent facts.";

const IMAGE_DESCRIBE_PROMPT =
  "You describe an image attached to a WhatsApp message in a group about AI/programming. CRITICAL FIRST STEP: decide if it's a screenshot of an app's own interface (sidebar nav, columns, chat-client chrome, dashboard) vs content being shared directly (chart, ranking, code, error, document, photo, someone else's message). If it's an app's own interface: describe ONLY the app itself — its name if visible, its purpose/layout, its features. Do NOT mention, name, or hint at any specific topic, model name, version number, or text visible inside its screen content — that is fake/demo/placeholder data and naming it would mislead the reader into thinking it's the real subject. If it's shared content instead: describe it verbatim — names, numbers, rankings (and positions), errors, metrics. Return JSON {isAppScreenshot: boolean, description: string (<=60 words)}.";

/**
 * Describe una imagen adjunta en un paso separado y enfocado, en vez de mandarla junto al
 * prompt de clasificación completo. Medido: el mismo prompt largo con la regla de "esto es
 * un screenshot de la propia app, ignora el contenido en pantalla" diluida entre las reglas
 * de NOISE/banter falla incluso con la instrucción reforzada; aislada, funciona de forma
 * consistente. Separar el paso evita repagar los tokens de imagen dos veces (ver análisis
 * de costo de pasar la imagen al matcher: ×21 sin mejora medible).
 */
async function describeImage(openai: OpenAI, imagePath: string): Promise<string | null> {
  try {
    const buffer = await readFile(imagePath);
    const ext = path.extname(imagePath).slice(1) || "jpeg";
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: IMAGE_DESCRIBE_PROMPT },
        { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/${ext};base64,${buffer.toString("base64")}` } }] },
      ],
    });
    const parsed = JSON.parse(response.choices[0]?.message.content ?? "{}") as { description?: string };
    return parsed.description ?? null;
  } catch (error) {
    console.error(`Failed to describe image at ${imagePath}:`, error);
    return null;
  }
}

/** Clasifica texto, incorporando la descripción de una imagen adjunta si la hay (nunca reenvía los píxeles). */
export async function classifyMessage(openai: OpenAI, content: string, imagePath?: string, context?: string): Promise<{ raw: string }> {
  const imageDescription = imagePath ? await describeImage(openai, imagePath) : null;
  const withImage = imageDescription ? `${content}\n\n[Descripción de la imagen adjunta: ${imageDescription}]` : content;
  const text = context
    ? `Recent chat messages (oldest to newest, for context — the new message may be an implicit reply to one of these, e.g. answering a question or reacting to something just posted):\n${context}\n\nNew message to classify:\n${withImage}`
    : withImage;
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: CLASSIFY_SYSTEM_PROMPT }, { role: "user", content: text }],
  });
  return { raw: response.choices[0]?.message.content ?? "{}" };
}

export const OFF_TOPIC_KEY = "off-topic";
export const OFF_TOPIC_TITLE = "🎲 Sin tema";

/** Hilo permanente por grupo donde caen bromas, reacciones y mensajes sin tema. */
export async function offTopicDiscussion(groupId: string, lastActivityAt: Date = new Date()) {
  return prisma.discussionThread.upsert({
    where: { groupId_topicKey: { groupId, topicKey: OFF_TOPIC_KEY } },
    create: {
      groupId,
      topicKey: OFF_TOPIC_KEY,
      title: OFF_TOPIC_TITLE,
      summary: "Bromas, reacciones y mensajes sueltos que no pertenecen a ninguna discusión.",
      tags: ["NOISE"],
      lastActivityAt,
    },
    update: { lastActivityAt },
  });
}

export const UNRESOLVED_REPLY_KEY = "unresolved-replies";
export const UNRESOLVED_REPLY_TITLE = "↪️ Respuestas sin contexto";

/** Bucket temporal para respuestas cuyo mensaje citado no llegó en el historial recuperado. */
export async function unresolvedReplyDiscussion(groupId: string, lastActivityAt: Date) {
  return prisma.discussionThread.upsert({
    where: { groupId_topicKey: { groupId, topicKey: UNRESOLVED_REPLY_KEY } },
    create: {
      groupId,
      topicKey: UNRESOLVED_REPLY_KEY,
      title: UNRESOLVED_REPLY_TITLE,
      summary: "Respuestas recuperadas cuyo mensaje citado todavía no está disponible.",
      tags: ["GENERAL_CHAT"],
      status: "PROPOSED",
      visibility: "PRIVATE",
      lastActivityAt,
    },
    update: { lastActivityAt },
  });
}

export const AI_MODELS_KEY = "ai-models";
export const AI_MODELS_TITLE = "🤖 Modelos de IA";

/**
 * Hilo permanente por grupo para anuncios, lanzamientos y comparativas de modelos de IA.
 * A diferencia de OFF_TOPIC, SÍ participa como candidato normal en matchDiscussion — el
 * matcher lo elige semánticamente igual que cualquier otro hilo, no por una regla aparte.
 * Se crea de antemano (no perezosamente) para que exista como candidato desde el primer
 * mensaje del grupo, evitando que el primer lanzamiento de modelo abra un hilo ad-hoc.
 */
export async function aiModelsDiscussion(groupId: string) {
  return prisma.discussionThread.upsert({
    where: { groupId_topicKey: { groupId, topicKey: AI_MODELS_KEY } },
    create: {
      groupId,
      topicKey: AI_MODELS_KEY,
      title: AI_MODELS_TITLE,
      summary:
        "Anuncios de lanzamiento, nuevas versiones, comparativas y benchmarks de modelos de IA (nombres de modelo, versiones, rankings, rendimiento). No incluye discusiones sobre cómo usar un modelo para una tarea concreta, eso pertenece al hilo de esa tarea.",
      tags: ["KNOWLEDGE"],
      status: "ACTIVE",
      visibility: "PRIVATE",
      lastActivityAt: new Date(0),
    },
    update: {},
  });
}

const MODEL_ENTITY_PATTERN = /\b(?:claude|opus|sonnet|haiku|chatgpt|gpt(?:[-\s]?\d[\w.-]*)?|gemini|llama|qwen|deepseek|mistral|grok|o[1-4]|codex|phi|kimi|sol)\b/giu;
const MODEL_COMPARISON_PATTERN = /\b(?:vs\.?|versus|compet\p{L}*|compit\p{L}*|compar\p{L}*|mejor|peor|ranking|benchmark|state.of.the.art|lanzamiento|release|versión|modelo)\b/iu;

/**
 * Intención especializada: una comparación, ranking o posicionamiento entre modelos no es
 * conversación sobre la API de un producto. “Sol compite con Opus, no con Sonnet” es el
 * caso límite: Sol por sí solo es ambiguo, pero acompañado de otros nombres de modelo no.
 */
export function isModelComparison(content: string) {
  const entities = new Set([...content.toLowerCase().matchAll(MODEL_ENTITY_PATTERN)].map((match) => match[0]));
  const hasUnambiguousEntity = [...entities].some((entity) => entity !== "sol");
  return MODEL_COMPARISON_PATTERN.test(content) && (entities.size >= 2 || hasUnambiguousEntity);
}

const typesafe = new TypeSafeClient();
const MATCH_CONFIDENCE_THRESHOLD = Number(process.env.DISCUSSION_MATCH_THRESHOLD ?? 0.6);
const CANDIDATE_LIMIT = 12;
const NEW_TOPIC = "new_topic";

/** Elige el hilo que continúa el mensaje, o null si abre tema nuevo. Expone confianza y
 * número de candidatos para que el caller pueda registrar la decisión (observabilidad). */
export async function matchDiscussion(
  groupId: string,
  content: string,
  context: string,
  excludeId?: string | null,
): Promise<{ thread: { id: string; title: string; summary: string | null; lastActivityAt: Date } | null; confidence: number; candidateCount: number }> {
  const recent = await prisma.discussionThread.findMany({
    where: {
      groupId,
      status: { in: ["ACTIVE", "PROPOSED"] },
      topicKey: { notIn: [OFF_TOPIC_KEY, AI_MODELS_KEY, UNRESOLVED_REPLY_KEY] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { lastActivityAt: "desc" },
    select: { id: true, title: true, summary: true, lastActivityAt: true },
  });
  // El hilo constante de modelos de IA siempre es candidato, sin importar cuándo tuvo
  // actividad por última vez: si no lo forzamos, un hilo poco usado se cae del top-N
  // ordenado por lastActivityAt en cuanto hay actividad reciente en otros temas.
  const constant = await prisma.discussionThread.findFirst({
    where: { groupId, topicKey: AI_MODELS_KEY, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, title: true, summary: true, lastActivityAt: true },
  });
  const candidates = constant && !recent.some((c) => c.id === constant.id) ? [...recent, constant] : recent;
  if (!candidates.length) return { thread: null, confidence: 1, candidateCount: 0 };
  const criteria: Record<string, string> = { [NEW_TOPIC]: "This message starts a new, unrelated discussion topic." };
  for (const candidate of candidates) {
    criteria[candidate.id] = `${candidate.title}${candidate.summary ? ` — ${candidate.summary}` : ""}`.slice(0, 500);
  }
  const state = context ? `Recent chat messages (oldest to newest, for context):\n${context}\n\nNew message to classify:\n${content}` : content;
  const { answers } = await typesafe.systemOne({
    state,
    questions: {
      match: choice(
        "Which existing discussion does the new message continue? WhatsApp replies are often short and implicit (e.g. naming an alternative, answering a question) without repeating keywords from the topic — use the recent chat context to judge if it's a reply within the same ongoing conversation, not just keyword overlap.",
        criteria,
      ),
    },
  });
  const { choice: pick, confidence } = answers.match;
  const candidateCount = candidates.length;
  if (pick === NEW_TOPIC || confidence < MATCH_CONFIDENCE_THRESHOLD) {
    return { thread: null, confidence, candidateCount };
  }
  return { thread: candidates.find((candidate) => candidate.id === pick) ?? null, confidence, candidateCount };
}

/** Margen para el desfase entre la hora de envío en WhatsApp y la de ingesta/descarga del adjunto. */
const INGEST_SKEW_MS = 5 * 60 * 1000;

/**
 * Contexto de los mensajes previos. Dos reglas que no son obvias:
 * 1. Para adjuntos usa la descripción que la visión ya infirió: sin esto una imagen
 *    aparece como "[Imagen]" y los comentarios que la responden son incomprensibles.
 * 2. Incluye adjuntos con timestamp ligeramente posterior: descargar media retrasa la
 *    ingesta, así que una imagen puede quedar registrada después del mensaje que la comenta.
 */
export async function recentContext(groupId: string, timestamp: Date, take = 8): Promise<string> {
  const select = {
    timestamp: true,
    senderName: true,
    content: true,
    metadata: true,
    media: { select: { kind: true } },
    discussion: { select: { title: true } },
  } as const;

  const [previous, skewedMedia] = await Promise.all([
    prisma.deckMessage.findMany({
      where: { groupId, timestamp: { lt: timestamp } },
      orderBy: { timestamp: "desc" },
      take,
      select,
    }),
    prisma.deckMessage.findMany({
      where: {
        groupId,
        media: { isNot: null },
        timestamp: { gte: timestamp, lte: new Date(timestamp.getTime() + INGEST_SKEW_MS) },
      },
      orderBy: { timestamp: "asc" },
      select,
    }),
  ]);

  return [...previous.reverse(), ...skewedMedia]
    .map((message) => {
      const meta = message.metadata as { title?: string; summary?: string } | null;
      const thread = message.discussion ? ` [hilo: ${message.discussion.title}]` : "";
      const described =
        message.media && (meta?.title || meta?.summary)
          ? `${message.content} (${message.media.kind.toLowerCase()}: ${meta.title ?? ""}${meta.summary ? ` — ${meta.summary}` : ""})`
          : message.content;
      return `${message.senderName}${thread}: ${described}`;
    })
    .join("\n");
}
