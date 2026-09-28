"use client";

import { useState } from "react";
import { api, relTime, type Discussion } from "@/lib/api";
import { useDeckStore } from "@/lib/store";
import { Avatar, LinkPreviewCard, MediaPreview } from "@/components/primitives";
import { MoreIcon, PinIcon, ReplyIcon, ShareIcon, RepostIcon } from "@/components/icons";

export function DiscussionCard({
  discussion,
  selected,
  onOpen,
}: {
  discussion: Discussion;
  selected: boolean;
  onOpen: () => void;
}) {
  const patchDiscussion = useDeckStore((state) => state.patchDiscussion);
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [followOpen, setFollowOpen] = useState(false);
  const [nextAction, setNextAction] = useState(discussion.nextAction ?? "");
  const [sending, setSending] = useState(false);
  const last = discussion.messages.at(-1);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    try {
      await api.reply(discussion.groupId, content, last?.id);
      setDraft("");
      setReplyOpen(false);
    } finally {
      setSending(false);
    }
  };

  const saveNextAction = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = nextAction.trim() || null;
    patchDiscussion(discussion.id, { nextAction: value });
    setFollowOpen(false);
    await api.updateDiscussion(discussion.id, { nextAction: value });
  };

  const resolve = async () => {
    patchDiscussion(discussion.id, { status: "RESOLVED" });
    await api.updateDiscussion(discussion.id, { status: "RESOLVED" });
  };

  return (
    <article
      className={`flex gap-3 border-b border-line-soft px-4 py-4 transition-colors last:border-b-0 ${
        selected ? "bg-white/6" : "hover:bg-white/2"
      }`}
    >
      <Avatar name={discussion.title} />

      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="block w-full text-left">
          <header className="flex items-center gap-1.5 text-[14px] leading-none">
            <span className="truncate font-semibold text-fg">{discussion.title}</span>
            <span className="shrink-0 text-fg-3">{relTime(discussion.lastActivityAt)}</span>
            {discussion.priority ? (
              <span className="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-2">
                {discussion.priority}
              </span>
            ) : null}
          </header>

          <p className="mt-1.5 line-clamp-3 text-[15px] leading-[21px] text-fg">
            {discussion.summary ?? last?.content ?? "Sin contenido."}
          </p>

          {discussion.ownerName ? (
            <p className="mt-1.5 text-[13px] text-fg-3">Responsable: {discussion.ownerName}</p>
          ) : null}
        </button>

        {last?.metadata?.media ? <MediaPreview media={last.metadata.media} /> : null}
        {last?.metadata?.preview ? <LinkPreviewCard preview={last.metadata.preview} /> : null}

        {discussion.nextAction ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-[10px] bg-panel-2 px-2.5 py-1.5 text-[13px] text-amber-300">
            <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {discussion.nextAction}
          </p>
        ) : null}

        <footer className="mt-2.5 -ml-2 flex items-center gap-1 text-fg-2">
          <button
            type="button"
            onClick={() => setReplyOpen((open) => !open)}
            aria-label="Responder"
            className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] transition-colors hover:bg-white/8 ${
              replyOpen ? "text-accent" : ""
            }`}
          >
            <ReplyIcon className="h-[18px] w-[18px]" />
            {discussion.messages.length}
          </button>

          <button
            type="button"
            onClick={() => setFollowOpen((open) => !open)}
            aria-label="Siguiente acción"
            className={`rounded-full px-2 py-1.5 transition-colors hover:bg-white/8 ${followOpen ? "text-accent" : ""}`}
          >
            <RepostIcon className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={resolve}
            aria-label="Marcar como resuelta"
            disabled={discussion.status === "RESOLVED"}
            className="rounded-full px-2 py-1.5 transition-colors hover:bg-white/8 disabled:text-fg-3 disabled:hover:bg-transparent"
          >
            <ShareIcon className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={onOpen}
            aria-label="Abrir discusión"
            className="ml-auto rounded-full px-2 py-1.5 transition-colors hover:bg-white/8"
          >
            <MoreIcon className="h-[15px] w-[15px]" />
          </button>
        </footer>

        {followOpen ? (
          <form onSubmit={saveNextAction} className="mt-2 flex gap-2">
            <input
              autoFocus
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="Siguiente acción…"
              className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-3 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            <button type="submit" className="shrink-0 rounded-full bg-white px-3 text-[13px] font-semibold text-black">
              Guardar
            </button>
          </form>
        ) : null}

        {replyOpen ? (
          <form onSubmit={send} className="mt-2 flex gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Responder en WhatsApp…"
              className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-3 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={sending}
              className="shrink-0 rounded-full bg-white px-3 text-[13px] font-semibold text-black disabled:opacity-50"
            >
              {sending ? "…" : "Enviar"}
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
