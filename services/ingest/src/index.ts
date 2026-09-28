import { createServer } from "node:http";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState, type GroupMetadata, type WAMessage } from "@whiskeysockets/baileys";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import P from "pino";
import QRCode from "qrcode";
import { IngestedMessageSchema, type IngestedMedia, type MediaKind } from "@deck/contracts";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const enrichmentQueue = new Queue("message-enrichment", { connection: redis });
const outboundQueue = new Queue("whatsapp-outbound", { connection: redis });
const TARGET_GROUPS = new Set((process.env.WHATSAPP_GROUP_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS ?? 1500);
let pairingQrSvg = "";
const GROUP_NAMES = new Map<string, string>();
const MEDIA_DIR = process.env.MEDIA_STORAGE_DIR ?? path.resolve(process.cwd(), "..", "..", "media-storage");
const MEDIA_KIND_BY_FIELD: Record<string, MediaKind> = { imageMessage: "IMAGE", videoMessage: "VIDEO", audioMessage: "AUDIO", documentMessage: "DOCUMENT", stickerMessage: "STICKER" };
const MEDIA_PLACEHOLDER: Record<MediaKind, string> = { IMAGE: "[Imagen]", VIDEO: "[Video]", AUDIO: "[Nota de voz]", DOCUMENT: "[Documento]", STICKER: "[Sticker]" };
type ConnectionState = "connecting" | "open" | "closed";
const health = { state: "connecting" as ConnectionState, connectedAt: null as string | null, lastMessageAt: null as string | null, lastCloseReason: null as string | null, reconnects: 0 };
createServer((request, response) => {
  if (request.url === "/status") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(health));
    return;
  }
  if (request.url === "/qr.svg") {
    response.writeHead(pairingQrSvg ? 200 : 204, { "cache-control": "no-store", "content-type": "image/svg+xml" });
    response.end(pairingQrSvg);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end('<!doctype html><title>WhatsApp pairing</title><meta http-equiv="refresh" content="5"><main style="display:grid;place-items:center;height:100vh;font:20px system-ui;background:#111;color:#fff"><div><h1>Scan with WhatsApp</h1><img src="/qr.svg" width="480" height="480" alt="WhatsApp pairing QR"><p>WhatsApp → Linked devices → Link a device</p></div></main>');
}).listen(Number(process.env.QR_PORT ?? 3002), "127.0.0.1", () => console.log("Open http://localhost:3002 to scan the WhatsApp QR."));

function unwrapContent(message: Record<string, unknown>): Record<string, unknown> {
  return (message.ephemeralMessage as { message?: Record<string, unknown> } | undefined)?.message ?? message;
}

function captionText(content: Record<string, unknown>): string | undefined {
  if (typeof content.conversation === "string" && content.conversation.length > 0) return content.conversation;
  const extendedText = content.extendedTextMessage;
  if (extendedText && typeof extendedText === "object" && "text" in extendedText && typeof extendedText.text === "string" && extendedText.text.length > 0) return extendedText.text;
  for (const key of ["imageMessage", "videoMessage", "documentMessage"] as const) {
    const media = content[key];
    if (media && typeof media === "object" && "caption" in media && typeof media.caption === "string" && media.caption.length > 0) return media.caption;
  }
  return undefined;
}

function extensionFromMime(mime: string): string {
  const sub = mime.split(";")[0]?.split("/")[1] ?? "bin";
  return sub === "jpeg" ? "jpg" : sub.replace(/[^a-z0-9]/gi, "");
}

function detectMedia(content: Record<string, unknown>): { field: string; kind: MediaKind; media: Record<string, unknown> } | undefined {
  for (const field of Object.keys(MEDIA_KIND_BY_FIELD)) {
    const media = content[field];
    if (media && typeof media === "object") return { field, kind: MEDIA_KIND_BY_FIELD[field]!, media: media as Record<string, unknown> };
  }
  return undefined;
}

async function saveMedia(message: WAMessage, detected: { field: string; kind: MediaKind; media: Record<string, unknown> }, messageId: string): Promise<IngestedMedia | undefined> {
  try {
    const mimeType = typeof detected.media.mimetype === "string" ? detected.media.mimetype : "application/octet-stream";
    const extension = extensionFromMime(mimeType);
    const fileName = `${messageId}.${extension}`;
    const buffer = await downloadMediaMessage(message, "buffer", {});
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(path.join(MEDIA_DIR, fileName), buffer);
    return { kind: detected.kind, fileName, mimeType, sizeBytes: buffer.length };
  } catch (error) {
    console.error(`Failed to download media for message ${messageId}:`, error);
    return undefined;
  }
}

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR ?? ".wa-auth";
const AUTH_BACKUP_DIR = process.env.WHATSAPP_AUTH_BACKUP_DIR ?? `${AUTH_DIR}.backup`;
let starting = false;
let lastBackupAt = 0;

async function backupAuthState() {
  const now = Date.now();
  if (now - lastBackupAt < 5 * 60_000) return;
  lastBackupAt = now;
  try {
    await cp(AUTH_DIR, AUTH_BACKUP_DIR, { recursive: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to back up WhatsApp session:`, error);
  }
}

async function start() {
  if (starting) return;
  starting = true;
  try {
    await startSocket();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Fatal error starting WhatsApp socket, exiting for supervisor restart:`, error);
    process.exit(1);
  } finally {
    starting = false;
  }
}

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  let groupMetadataCache = new Map<string, GroupMetadata>();
  const socket = makeWASocket({
    auth: state, version, logger: P({ level: "silent" }), printQRInTerminal: false, syncFullHistory: false,
    cachedGroupMetadata: async (jid) => groupMetadataCache.get(jid),
  });

  socket.ev.on("creds.update", async () => { await saveCreds(); void backupAuthState(); });
  socket.ev.on("connection.update", ({ connection, lastDisconnect, qr: pairingQr }) => {
    if (connection === "open") {
      health.state = "open";
      health.connectedAt = new Date().toISOString();
      health.lastCloseReason = null;
      void socket.groupFetchAllParticipating().then((groupById) => {
        groupMetadataCache = new Map(Object.entries(groupById));
        const groups = Object.values(groupById).map((group) => ({ id: group.id, name: group.subject }));
        for (const group of groups) GROUP_NAMES.set(group.id, group.name);
        const selectedGroups = TARGET_GROUPS.size > 0 ? groups.filter((group) => TARGET_GROUPS.has(group.id)) : groups;
        console.log(`[${new Date().toISOString()}] WhatsApp connected. Ingestion target: ${TARGET_GROUPS.size > 0 ? "configured groups" : "all groups"}.`);
        console.table(selectedGroups);
      });
    }
    if (pairingQr) {
      void QRCode.toString(pairingQr, { type: "svg", margin: 2, width: 720 }).then((svg) => { pairingQrSvg = svg; });
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      health.state = "closed";
      health.reconnects += 1;
      health.lastCloseReason = `status ${statusCode ?? "unknown"} at ${new Date().toISOString()}`;
      console.error(`[${new Date().toISOString()}] WhatsApp connection closed${statusCode ? ` (status ${statusCode})` : ""}.`);
      if (statusCode !== DisconnectReason.loggedOut) void start();
    }
  });
  socket.ev.on("messages.upsert", ({ messages, type }) => {
    console.log(`[${new Date().toISOString()}] WhatsApp messages.upsert: type=${type}, count=${messages.length}.`);
    for (const message of messages) {
      void (async () => {
        try {
          const groupId = message.key.remoteJid;
          const shouldProcess = type === "notify" || Boolean(message.key.fromMe);
          const isTargetGroup = Boolean(groupId?.endsWith("@g.us") && (TARGET_GROUPS.size === 0 || TARGET_GROUPS.has(groupId)));
          if (!shouldProcess || !isTargetGroup || !groupId || !message.message || !message.key.id) return;
          health.lastMessageAt = new Date().toISOString();
          const content = unwrapContent(message.message as Record<string, unknown>);
          const text = captionText(content);
          const detected = detectMedia(content);
          const media = detected ? await saveMedia(message, detected, message.key.id) : undefined;
          console.log(`WhatsApp message: group=${groupId} text=${Boolean(text)} media=${media?.kind ?? "none"} accepted=${Boolean(text || media)}.`);
          if (!text && !media) return;
          const payload = IngestedMessageSchema.parse({
            id: message.key.id, groupId, groupName: GROUP_NAMES.get(groupId) ?? groupId, senderJid: message.key.participant ?? groupId,
            senderName: message.pushName ?? "Unknown", content: text || MEDIA_PLACEHOLDER[media!.kind],
            parentMessageId: (message.message?.extendedTextMessage?.contextInfo?.stanzaId),
            timestamp: new Date(Number(message.messageTimestamp) * 1000).toISOString(), isOutbound: Boolean(message.key.fromMe),
            media,
          });
          void enrichmentQueue.add("enrich", payload, { jobId: payload.id, delay: DEBOUNCE_MS, removeOnComplete: 1000, removeOnFail: 5000 });
        } catch (error) {
          console.error("Failed to process incoming WhatsApp message, skipping it:", error);
        }
      })();
    }
  });


  new Worker("whatsapp-outbound", async (job) => {
    const payload = job.data as { groupId: string; content: string; parentMessageId?: string };
    console.log(`Sending WhatsApp message to ${payload.groupId}: "${payload.content.slice(0, 60)}"`);
    const { promise: timeout, reject: timeoutReject } = Promise.withResolvers<never>();
    const timer = setTimeout(() => timeoutReject(new Error("sendMessage timed out after 60s")), 60000);
    await Promise.race([
      socket.sendMessage(payload.groupId, { text: payload.content }, payload.parentMessageId ? { quoted: { key: { id: payload.parentMessageId, remoteJid: payload.groupId } } as never } : undefined),
      timeout,
    ]);
    clearTimeout(timer);
    console.log(`WhatsApp message sent successfully to ${payload.groupId}.`);
  }, { connection: redis });

  process.once("SIGINT", async () => { await Promise.all([enrichmentQueue.close(), outboundQueue.close(), redis.quit()]); process.exit(0); });
}
process.on("uncaughtException", (error) => { console.error(`[${new Date().toISOString()}] Uncaught exception, exiting for supervisor restart:`, error); process.exit(1); });
process.on("unhandledRejection", (error) => { console.error(`[${new Date().toISOString()}] Unhandled rejection, exiting for supervisor restart:`, error); process.exit(1); });
void start();
