export const API = "/api";

export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "STICKER";
export type MediaInfo = { kind: MediaKind; fileName: string; mimeType: string; sizeBytes: number };

export type LinkPreview = {
  url: string;
  siteName: string;
  title: string | null;
  description: string | null;
  imageFileName: string | null;
};

export type DeckMessage = {
  id: string;
  groupId: string;
  columnId: string | null;
  discussionId: string | null;
  senderName: string;
  content: string;
  category: string;
  parentMessageId: string | null;
  timestamp: string;
  isOutbound: boolean;
  metadata: { title?: string; topic?: string; summary?: string; media?: MediaInfo; preview?: LinkPreview | null } | null;
};

export type Discussion = {
  id: string;
  groupId: string;
  topicKey: string;
  title: string;
  summary: string | null;
  status: "PROPOSED" | "ACTIVE" | "RESOLVED";
  visibility: "PRIVATE" | "MEMBERS" | "PUBLIC";
  ownerName: string | null;
  nextAction: string | null;
  priority: string | null;
  lastActivityAt: string;
  messages: DeckMessage[];
};

export type DeckColumn = { id: string; slug: string; title: string; category: string };
export type Group = { id: string; name: string; columns: DeckColumn[] };

export type Notification = {
  id: string;
  groupId: string;
  type: "MENTION" | "FOLLOW_UP_DUE" | "NEW_DISCUSSION";
  title: string;
  body: string | null;
  discussionId: string | null;
  read: boolean;
  createdAt: string;
};

export type IngestStatus = {
  state: "connecting" | "open" | "closed" | "unreachable";
  lastMessageAt: string | null;
};

export type ObservabilityVersion = {
  promptVersion: string;
  total: number;
  correctedCount: number;
  overrideRate: number;
  avgConfidence: number | null;
  newTopicRate: number | null;
  methodCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
};

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${input} → ${response.status}`);
  return (await response.json()) as T;
}

export const api = {
  groups: () => json<Group[]>(`${API}/groups`),
  discussions: (groupId: string) => json<Discussion[]>(`${API}/groups/${encodeURIComponent(groupId)}/discussions`),
  notifications: (groupId: string) => json<Notification[]>(`${API}/groups/${encodeURIComponent(groupId)}/notifications`),
  ingestStatus: () => json<IngestStatus>(`${API}/ingest-status`),
  observability: (groupId: string) =>
    json<{ versions: ObservabilityVersion[] }>(`${API}/groups/${encodeURIComponent(groupId)}/observability`),
  reply: (groupId: string, content: string, parentMessageId?: string) =>
    json<{ id: string }>(`${API}/groups/${encodeURIComponent(groupId)}/replies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, parentMessageId }),
    }),
  updateDiscussion: (id: string, data: { status?: string; visibility?: "PRIVATE" | "MEMBERS" | "PUBLIC"; ownerName?: string | null; nextAction?: string | null; priority?: string | null }) =>
    json<Discussion>(`${API}/discussions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  readNotification: (id: string) => json<Notification>(`${API}/notifications/${id}`, { method: "PATCH" }),
  rerouteMessage: (messageId: string, discussionId: string | null, correctedBy?: string) =>
    json<DeckMessage>(`${API}/messages/${encodeURIComponent(messageId)}/discussion`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discussionId, correctedBy }),
    }),
};

export function mediaUrl(fileName: string) {
  return `${API}/media/${encodeURIComponent(fileName)}`;
}

export function relTime(iso: string) {
  const diff = (Date.now() - Number(new Date(iso))) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))} s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

export function hueFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}
