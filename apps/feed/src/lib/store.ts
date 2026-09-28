import { create } from "zustand";
import type { Discussion, Group, IngestStatus, Notification } from "@/lib/api";

type State = {
  group: Group | null;
  groups: Group[];
  discussions: Discussion[];
  notifications: Notification[];
  notificationPopouts: Notification[];
  ingestStatus: IngestStatus | null;
  loaded: boolean;
  setGroups(groups: Group[]): void;
  setGroup(group: Group): void;
  setDiscussions(discussions: Discussion[]): void;
  setNotifications(notifications: Notification[]): void;
  addNotification(notification: Notification): void;
  dismissNotificationPopout(id: string): void;
  markNotificationRead(id: string): void;
  setIngestStatus(status: IngestStatus): void;
  patchDiscussion(id: string, data: Partial<Discussion>): void;
  moveMessage(messageId: string, fromDiscussionId: string | null, toDiscussionId: string | null): void;
};

export const useDeckStore = create<State>((set) => ({
  group: null,
  groups: [],
  discussions: [],
  notifications: [],
  notificationPopouts: [],
  ingestStatus: null,
  loaded: false,
  setGroups: (groups) => set({ groups }),
  setGroup: (group) => set({ group }),
  setDiscussions: (discussions) =>
    set({
      loaded: true,
      discussions: [...discussions].sort(
        (a, b) => Number(new Date(b.lastActivityAt)) - Number(new Date(a.lastActivityAt)),
      ),
    }),
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) =>
    set((state) => {
      if (state.notifications.some((item) => item.id === notification.id)) return state;
      return {
        notifications: [notification, ...state.notifications],
        notificationPopouts: [notification, ...state.notificationPopouts].slice(0, 3),
      };
    }),
  dismissNotificationPopout: (id) =>
    set((state) => ({ notificationPopouts: state.notificationPopouts.filter((item) => item.id !== id) })),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((item) => (item.id === id ? { ...item, read: true } : item)),
    })),
  setIngestStatus: (ingestStatus) => set({ ingestStatus }),
  patchDiscussion: (id, data) =>
    set((state) => ({
      discussions: state.discussions.map((item) => (item.id === id ? { ...item, ...data } : item)),
    })),
  moveMessage: (messageId, fromDiscussionId, toDiscussionId) =>
    set((state) => {
      let moved: Discussion["messages"][number] | undefined;
      const withoutMessage = state.discussions.map((thread) => {
        if (thread.id !== fromDiscussionId) return thread;
        const remaining = thread.messages.filter((message) => {
          if (message.id !== messageId) return true;
          moved = message;
          return false;
        });
        return { ...thread, messages: remaining };
      });
      if (!moved) return state;
      const relocated = { ...moved, discussionId: toDiscussionId };
      return {
        discussions: withoutMessage.map((thread) =>
          thread.id === toDiscussionId ? { ...thread, messages: [...thread.messages, relocated] } : thread,
        ),
      };
    }),
}));
