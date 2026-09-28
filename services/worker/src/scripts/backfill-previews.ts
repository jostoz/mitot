import path from "node:path";
import { prisma } from "@deck/database";
import { extractUrls, unfurl } from "../unfurl.js";

const MEDIA_DIR = process.env.MEDIA_STORAGE_DIR ?? path.resolve(process.cwd(), "..", "..", "media-storage");

/**
 * Añade `metadata.preview` a mensajes ya enriquecidos que contienen un enlace.
 * No llama a OpenAI ni reclasifica: solo hace unfurl y actualiza el metadata.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const candidates = await prisma.deckMessage.findMany({
    where: { content: { contains: "http" } },
    select: { id: true, content: true, metadata: true },
    orderBy: { timestamp: "asc" },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const message of candidates) {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    if (metadata.preview) {
      skipped += 1;
      continue;
    }
    const [url] = extractUrls(message.content);
    if (!url) {
      skipped += 1;
      continue;
    }

    const preview = await unfurl(url, MEDIA_DIR);
    if (!preview) {
      failed += 1;
      console.warn(`sin preview: ${url}`);
      continue;
    }

    console.log(`${dryRun ? "[dry-run] " : ""}${message.id} → ${preview.siteName}: ${preview.title ?? "(sin título)"}`);
    if (!dryRun) {
      await prisma.deckMessage.update({ where: { id: message.id }, data: { metadata: { ...metadata, preview } } });
    }
    updated += 1;
  }

  console.log(`\ncandidatos: ${candidates.length} · actualizados: ${updated} · omitidos: ${skipped} · fallidos: ${failed}`);
  await prisma.$disconnect();
}

await main();
