export type PublicMessage = {
  id: string;
  content: string;
  timestamp: string;
  metadata: { preview?: { url: string; siteName: string; title: string | null } } | null;
};

export type PublicDiscussion = {
  id: string;
  title: string;
  summary: string | null;
  lastActivityAt: string;
  messages: PublicMessage[];
};

export type PublicPayload = { group: { name: string }; discussions: PublicDiscussion[] };

/**
 * Fetch compartido entre la página y `generateMetadata`/`opengraph-image`: Next.js
 * deduplica llamadas `fetch` idénticas dentro del mismo render, así que esto no duplica
 * la petición al backend aunque se invoque desde tres lugares distintos.
 */
export async function fetchPublicCommunity(groupId: string): Promise<PublicPayload | null> {
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:3001";
  // `groupId` ya llega percent-encoded desde el segmento de ruta de Next;
  // volver a codificarlo produciría %2540 y un 404.
  const response = await fetch(`${base}/public/groups/${groupId}/discussions`, { cache: "no-store" });
  return response.ok ? ((await response.json()) as PublicPayload) : null;
}
