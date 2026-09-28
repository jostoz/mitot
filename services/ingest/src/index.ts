import { createServer } from "node:http";
import { DisconnectReason, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState, type GroupMetadata } from "@whiskeysockets/baileys";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import P from "pino";
import QRCode from "qrcode";
import { IngestedMessageSchema } from "@deck/contracts";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const enrichmentQueue = new Queue("message-enrichment", { connection: redis });
const outboundQueue = new Queue("whatsapp-outbound", { connection: redis });
const TARGET_GROUPS = new Set((process.env.WHATSAPP_GROUP_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS ?? 1500);
let pairingQrSvg = "";
const GROUP_NAMES = new Map<string, string>();
createServer((request, response) => {
  if (request.url === "/qr.svg") {
    response.writeHead(pairingQrSvg ? 200 : 204, { "cache-control": "no-store", "content-type": "image/svg+xml" });
    response.end(pairingQrSvg);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end('<!doctype html><title>WhatsApp pairing</title><meta http-equiv="refresh" content="5"><main style="display:grid;place-items:center;height:100vh;font:20px system-ui;background:#111;color:#fff"><div><h1>Scan with WhatsApp</h1><img src="/qr.svg" width="480" height="480" alt="WhatsApp pairing QR"><p>WhatsApp → Linked devices → Link a device</p></div></main>');
}).listen(Number(process.env.QR_PORT ?? 3002), "127.0.0.1", () => console.log("Open http://localhost:3002 to scan the WhatsApp QR."));

function messageText(message: Record<string, unknown>): string | undefined {
  const content = (message.ephemeralMessage as { message?: Record<string, unknown> } | undefined)?.message ?? message;
  if (typeof content.conversation === "string") return content.conversation;
  const extendedText = content.extendedTextMessage;
  if (extendedText && typeof extendedText === "object" && "text" in extendedText && typeof extendedText.text === "string") return extendedText.text;
  for (const key of ["imageMessage", "videoMessage", "documentMessage"] as const) {
    const media = content[key];
    if (media && typeof media === "object" && "caption" in media && typeof media.caption === "string") return media.caption;
  }
  return undefined;
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(process.env.WHATSAPP_AUTH_DIR ?? ".wa-auth");
  const { version } = await fetchLatestBaileysVersion();
  let groupMetadataCache = new Map<string, GroupMetadata>();
  const socket = makeWASocket({
    auth: state, version, logger: P({ level: "silent" }), printQRInTerminal: false, syncFullHistory: false,
    cachedGroupMetadata: async (jid) => groupMetadataCache.get(jid),
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", ({ connection, lastDisconnect, qr: pairingQr }) => {
    if (connection === "open") {
      void socket.groupFetchAllParticipating().then((groupById) => {
        groupMetadataCache = new Map(Object.entries(groupById));
        const groups = Object.values(groupById).map((group) => ({ id: group.id, name: group.subject }));
        for (const group of groups) GROUP_NAMES.set(group.id, group.name);
        const selectedGroups = TARGET_GROUPS.size > 0 ? groups.filter((group) => TARGET_GROUPS.has(group.id)) : groups;
        console.log(`WhatsApp connected. Ingestion target: ${TARGET_GROUPS.size > 0 ? "configured groups" : "all groups"}.`);
        console.table(selectedGroups);
      });
    }
    if (pairingQr) {
      void QRCode.toString(pairingQr, { type: "svg", margin: 2, width: 720 }).then((svg) => { pairingQrSvg = svg; });
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      console.error(`WhatsApp connection closed${statusCode ? ` (status ${statusCode})` : ""}.`);
      if (statusCode !== DisconnectReason.loggedOut) void start();
    }
  });
  socket.ev.on("messages.upsert", ({ messages, type }) => {
    console.log(`WhatsApp messages.upsert: type=${type}, count=${messages.length}.`);
    for (const message of messages) {
      try {
        const groupId = message.key.remoteJid;
        const text = message.message ? messageText(message.message as Record<string, unknown>) : undefined;
        const shouldProcess = type === "notify" || Boolean(message.key.fromMe);
        const isTargetGroup = Boolean(groupId?.endsWith("@g.us") && (TARGET_GROUPS.size === 0 || TARGET_GROUPS.has(groupId)));
        console.log(`WhatsApp message: group=${groupId ?? "none"} target=${isTargetGroup} text=${Boolean(text)} accepted=${shouldProcess && isTargetGroup && Boolean(text)}.`);
        if (!shouldProcess || !isTargetGroup || !text || !groupId) continue;
        const payload = IngestedMessageSchema.parse({
          id: message.key.id, groupId, groupName: GROUP_NAMES.get(groupId) ?? groupId, senderJid: message.key.participant ?? groupId,
          senderName: message.pushName ?? "Unknown", content: text,
          parentMessageId: (message.message?.extendedTextMessage?.contextInfo?.stanzaId),
          timestamp: new Date(Number(message.messageTimestamp) * 1000).toISOString(), isOutbound: Boolean(message.key.fromMe),
        });
        void enrichmentQueue.add("enrich", payload, { jobId: payload.id, delay: DEBOUNCE_MS, removeOnComplete: 1000, removeOnFail: 5000 });
      } catch (error) {
        console.error("Failed to process incoming WhatsApp message, skipping it:", error);
      }
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
process.on("uncaughtException", (error) => console.error("Uncaught exception (ingest kept running):", error));
process.on("unhandledRejection", (error) => console.error("Unhandled rejection (ingest kept running):", error));
void start();
