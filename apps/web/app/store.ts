import { create } from "zustand";

export type DeckMessage = { id: string; groupId: string; columnId: string | null; discussionId: string | null; senderName: string; content: string; category: string; parentMessageId: string | null; timestamp: string; isOutbound: boolean; metadata: { title?: string; topic?: string; summary?: string } | null };
export type Discussion = { id: string; groupId: string; title: string; summary: string | null; status: string; ownerName: string | null; nextAction: string | null; priority: string | null; lastActivityAt: string; messages: DeckMessage[] };
export type DeckColumn = { id: string; slug: string; title: string; category: string };
export type Group = { id: string; name: string; columns: DeckColumn[] };
type State = { group: Group | null; discussions: Discussion[]; setGroup(group: Group): void; setDiscussions(discussions: Discussion[]): void };
export const useDeckStore = create<State>((set) => ({
  group: null,
  discussions: [],
  setGroup: (group) => set({ group }),
  setDiscussions: (discussions) => set({ discussions: [...discussions].sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt)) }),
}));
