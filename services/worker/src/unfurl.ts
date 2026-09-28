import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export type LinkPreview = {
  url: string;
  siteName: string;
  title: string | null;
  description: string | null;
  imageFileName: string | null;
};

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;
const FETCH_TIMEOUT_MS = Number(process.env.UNFURL_TIMEOUT_MS ?? 6000);
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const USER_AGENT = "MitotDeckBot/1.0 (+link-preview)";

export function extractUrls(content: string): string[] {
  const found = content.match(URL_PATTERN) ?? [];
  const unique: string[] = [];
  for (const raw of found) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    if (!unique.includes(url)) unique.push(url);
  }
  return unique;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    "i",
  );
  const match = html.match(pattern);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeEntities(value) : null;
}

async function fetchWithTimeout(url: string, accept: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept },
    });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImage(imageUrl: string, mediaDir: string): Promise<string | null> {
  const response = await fetchWithTimeout(imageUrl, "image/*");
  if (!response) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) return null;
  const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
  const fileName = `preview-${createHash("sha1").update(imageUrl).digest("hex").slice(0, 16)}.${extension}`;
  await writeFile(path.join(mediaDir, fileName), buffer);
  return fileName;
}

/** Descarga la URL, extrae Open Graph y guarda la imagen localmente para no exponer al cliente al host remoto. */
export async function unfurl(url: string, mediaDir: string): Promise<LinkPreview | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const response = await fetchWithTimeout(url, "text/html,application/xhtml+xml");
  if (!response) return null;
  if (!(response.headers.get("content-type") ?? "").includes("html")) return null;

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  const title =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ??
    null;
  const description =
    metaContent(html, "og:description") ?? metaContent(html, "twitter:description") ?? metaContent(html, "description");
  const rawImage = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");

  let imageFileName: string | null = null;
  if (rawImage) {
    try {
      imageFileName = await downloadImage(new URL(rawImage, response.url || url).toString(), mediaDir);
    } catch {
      imageFileName = null;
    }
  }

  return {
    url: response.url || url,
    siteName: metaContent(html, "og:site_name") ?? parsed.hostname.replace(/^www\./, ""),
    title: title || null,
    description: description || null,
    imageFileName,
  };
}
