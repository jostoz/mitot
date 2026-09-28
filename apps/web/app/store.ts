import { create } from "zustand";

export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "STICKER";
export type MediaInfo = { kind: MediaKind; fileName: string; mimeType: string; sizeBytes: number };
export type DeckMessage = { id: string; groupId: string; columnId: string | null; discussionId: string | null; senderName: string; content: string; category: string; parentMessageId: string | null; timestamp: string; isOutbound: boolean; metadata: { title?: string; topic?: string; summary?: string; media?: MediaInfo } | null };
export type Discussion = { id: string; groupId: string; title: string; summary: string | null; status: string; ownerName: string | null; nextAction: string | null; priority: string | null; lastActivityAt: string; messages: DeckMessage[] };
export type DeckColumn = { id: string; slug: string; title: string; category: string };
export type Group = { id: string; name: string; columns: DeckColumn[] };
export type Notification = { id: string; groupId: string; type: "MENTION" | "FOLLOW_UP_DUE" | "NEW_DISCUSSION"; title: string; body: string | null; discussionId: string | null; read: boolean; createdAt: string };
type State = {
  group: Group | null;
  discussions: Discussion[];
  notifications: Notification[];
  setGroup(group: Group): void;
  setDiscussions(discussions: Discussion[]): void;
  setNotifications(notifications: Notification[]): void;
  addNotification(notification: Notification): void;
  markNotificationRead(id: string): void;
};
export const useDeckStore = create<State>((set) => ({
  group: null,
  discussions: [],
  notifications: [],
  setGroup: (group) => set({ group }),
  setDiscussions: (discussions) => set({ discussions: [...discussions].sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt)) }),
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) => set((state) => state.notifications.some((n) => n.id === notification.id) ? state : { notifications: [notification, ...state.notifications] }),
  markNotificationRead: (id) => set((state) => ({ notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
}));
