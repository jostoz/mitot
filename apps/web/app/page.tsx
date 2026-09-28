"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, Clock3, FileText, Home, MessageCircle, MoreHorizontal, Plus, Repeat2, Send, Sparkles, User, X } from "lucide-react";
import { type Discussion, type Group, type MediaInfo, type Notification, useDeckStore } from "./store";
const API = "/api";
const PALETTE = ["#7c6cff", "#ff6c8b", "#3ecf8e", "#f2b705", "#4ea1ff", "#ff9f4e"];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function relTime(iso: string) {
  const diff = (Date.now() - +new Date(iso)) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function MediaPreview({ media }: { media: MediaInfo }) {
  const src = `${API}/media/${encodeURIComponent(media.fileName)}`;
  if (media.kind === "IMAGE" || media.kind === "STICKER") return <img src={src} alt="Adjunto" className="mt-2 max-h-64 rounded-xl border border-[#1c1c1e] object-contain" />;
  if (media.kind === "VIDEO") return <video src={src} controls className="mt-2 max-h-64 w-full rounded-xl border border-[#1c1c1e]" />;
  if (media.kind === "AUDIO") return <audio src={src} controls className="mt-2 w-full" />;
  return <a href={src} target="_blank" rel="noreferrer" className="mt-2 flex w-fit items-center gap-2 rounded-xl border border-[#1c1c1e] bg-[#0a0a0a] px-3 py-2 text-xs text-[#7c6cff]"><FileText className="size-4" />{media.fileName}</a>;
}

function Card({ item, selected, open }: { item: Discussion; selected: boolean; open(): void }) {
  const [reply, setReply] = useState(false), [draft, setDraft] = useState(""), [follow, setFollow] = useState(false), [next, setNext] = useState("");
  const last = item.messages[item.messages.length - 1]!;
  const color = avatarColor(item.title);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    setReply(false);
    await fetch(`${API}/groups/${encodeURIComponent(item.groupId)}/replies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, parentMessageId: last.id }) });
  }
  async function update(data: object) {
    await fetch(`${API}/discussions/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  }
  return (
    <article className={`border-b border-[#1c1c1e] px-4 py-3 ${selected ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}>
      <button onClick={open} className="flex w-full gap-3 text-left">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-black" style={{ backgroundColor: color }}>{item.title.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px]">
            <b className="truncate">{item.title}</b>
            <span className="text-[#5b5f63]">·</span>
            <span className="shrink-0 text-[#5b5f63]">{relTime(item.lastActivityAt)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[14px] leading-5 text-[#c6c8cb]">{item.summary ?? last.content}</p>
          {last.metadata?.media && <MediaPreview media={last.metadata.media} />}
        </div>
      </button>
      <div className="mt-2.5 flex items-center gap-5 pl-12 text-[#71767b]">
        <button onClick={() => setReply(!reply)} title="Reply" className="flex items-center gap-1.5 hover:text-[#7c6cff]"><MessageCircle className="size-[17px]" /><span className="text-xs">{item.messages.length}</span></button>
        <button onClick={() => setFollow(!follow)} title="Follow-up" className="hover:text-[#7c6cff]"><Repeat2 className="size-[18px]" /></button>
        <button onClick={open} title="Open" className="hover:text-[#7c6cff]"><ChevronRight className="size-[17px]" /></button>
      </div>
      {follow && (
        <form onSubmit={(e) => { e.preventDefault(); void update({ nextAction: next }); setFollow(false); }} className="ml-12 mt-2.5 flex gap-2">
          <input autoFocus value={next} onChange={(e) => setNext(e.target.value)} className="min-w-0 flex-1 rounded-full border border-[#2f3336] bg-transparent px-3 py-1.5 text-xs outline-none focus:border-[#7c6cff]" placeholder="Next action…" />
          <button className="rounded-full bg-[#7c6cff] px-3 text-xs font-medium text-black">Save</button>
        </form>
      )}
      {reply && (
        <form onSubmit={send} className="ml-12 mt-2.5 flex gap-2">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded-full border border-[#2f3336] bg-transparent px-3 py-1.5 text-xs outline-none focus:border-[#7c6cff]" placeholder="Reply in WhatsApp…" />
          <button className="rounded-full bg-[#7c6cff] px-3 text-xs font-medium text-black">Send</button>
        </form>
      )}
    </article>
  );
}

type ColumnKey = "active" | "needsResponse" | "resolved" | "mentions";
const COLUMN_META: Record<ColumnKey, { title: string }> = {
  active: { title: "Active discussions" }, needsResponse: { title: "Needs response" },
  resolved: { title: "Resolved" }, mentions: { title: "Mentions" },
};

function Column({ colKey, items, selected, open, onHide }: { colKey: ColumnKey; items: Discussion[]; selected?: string; open(id: string): void; onHide(): void }) {
  const [menu, setMenu] = useState(false);
  return (
    <section className="flex h-full w-[340px] shrink-0 flex-col border-r border-[#1c1c1e]">
      <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-[#1c1c1e] px-3">
        <span className="text-[15px] font-semibold">{COLUMN_META[colKey].title}</span>
        <span className="ml-2 text-xs text-[#5b5f63]">{items.length}</span>
        <button onClick={() => setMenu(!menu)} className="absolute right-3 text-[#71767b] hover:text-white"><MoreHorizontal className="size-[18px]" /></button>
        {menu && (
          <div className="absolute right-3 top-11 z-10 w-40 rounded-xl border border-[#2f3336] bg-[#16181c] p-1 text-sm shadow-xl">
            <button onClick={() => { onHide(); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]"><X className="size-4" />Remove column</button>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length ? items.map((item) => <Card key={item.id} item={item} selected={item.id === selected} open={() => open(item.id)} />) : <p className="p-4 text-xs text-[#5b5f63]">Nothing here.</p>}
      </div>
    </section>
  );
}

function AddColumnTile({ hidden, onAdd }: { hidden: ColumnKey[]; onAdd(key: ColumnKey): void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="relative flex h-full w-16 shrink-0 flex-col items-center border-r border-[#1c1c1e] pt-3">
      <button onClick={() => setOpen(!open)} className="flex size-9 items-center justify-center rounded-full border border-dashed border-[#2f3336] text-[#71767b] hover:border-[#7c6cff] hover:text-[#7c6cff]"><Plus className="size-5" /></button>
      {open && (
        <div className="absolute left-2 top-14 z-10 w-48 rounded-xl border border-[#2f3336] bg-[#16181c] p-1 text-sm shadow-xl">
          {hidden.length ? hidden.map((k) => (
            <button key={k} onClick={() => { onAdd(k); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]">{COLUMN_META[k].title}</button>
          )) : <p className="px-2 py-1.5 text-[#5b5f63]">No hidden columns</p>}
        </div>
      )}
    </section>
  );
}

function NotificationBell({ notifications, onOpen, onRead }: { notifications: Notification[]; onOpen(id: string | null): void; onRead(id: string): void }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex size-10 items-center justify-center rounded-full text-[#e7e9ea] hover:bg-white/[0.08]">
        <Bell className="size-6" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#ff6c8b]" />}
      </button>
      {open && (
        <div className="absolute left-14 top-0 z-20 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-[#2f3336] bg-[#16181c] shadow-2xl">
          <header className="border-b border-[#1c1c1e] px-4 py-3 text-sm font-semibold">Notifications</header>
          {notifications.length ? notifications.map((n) => (
            <button key={n.id} onClick={() => { onRead(n.id); onOpen(n.discussionId); setOpen(false); }} className={`flex w-full flex-col border-b border-[#1c1c1e] px-4 py-2.5 text-left hover:bg-white/[0.04] ${n.read ? "opacity-50" : ""}`}>
              <span className="text-[13px] font-medium">{n.title}</span>
              {n.body && <span className="mt-0.5 line-clamp-2 text-xs text-[#8b98a5]">{n.body}</span>}
              <span className="mt-1 text-[11px] text-[#5b5f63]">{relTime(n.createdAt)}</span>
            </button>
          )) : <p className="px-4 py-6 text-center text-xs text-[#5b5f63]">No notifications yet.</p>}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const { group, discussions, notifications, setGroup, setDiscussions, setNotifications, addNotification, markNotificationRead } = useDeckStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [hidden, setHidden] = useState<ColumnKey[]>(["mentions", "resolved"]);
  const [order] = useState<ColumnKey[]>(["active", "needsResponse", "resolved", "mentions"]);
  const groupIdRef = useRef<string | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  async function loadDiscussions(groupId: string) {
    const data: Discussion[] = await fetch(`${API}/groups/${encodeURIComponent(groupId)}/discussions`).then((r) => r.json());
    setDiscussions(data);
  }
  async function loadNotifications(groupId: string) {
    const data: Notification[] = await fetch(`${API}/groups/${encodeURIComponent(groupId)}/notifications`).then((r) => r.json());
    setNotifications(data);
  }

  useEffect(() => {
    void (async () => {
      const groups: Group[] = await fetch(`${API}/groups`).then((r) => r.json());
      if (!groups[0]) return;
      setGroup(groups[0]);
      groupIdRef.current = groups[0].id;
      await Promise.all([loadDiscussions(groups[0].id), loadNotifications(groups[0].id)]);
    })();
    const url = new URL(`${API}/events`, window.location.origin);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    let timer: number | undefined;
    ws.onmessage = (event) => {
      if (!groupIdRef.current) return;
      const parsed = JSON.parse(event.data) as { type: string; notification?: Notification };
      if (parsed.type === "notification.created" && parsed.notification) addNotification(parsed.notification);
      clearTimeout(timer);
      timer = window.setTimeout(() => void loadDiscussions(groupIdRef.current!), 500);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setExpanded((wasExpanded) => {
        if (wasExpanded) return false;
        setSelected(null);
        return false;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { ws.close(); clearTimeout(timer); window.removeEventListener("keydown", onKeyDown); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = columnsRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const active = discussions.find((d) => d.id === selected);
  const activeDiscussions = discussions.filter((d) => d.status === "ACTIVE");
  const needsResponse = activeDiscussions.filter((d) => /\?$/.test(d.messages[d.messages.length - 1]?.content.trim() ?? ""));
  const resolved = discussions.filter((d) => d.status === "RESOLVED");
  const itemsByKey: Record<ColumnKey, Discussion[]> = { active: activeDiscussions, needsResponse, resolved, mentions: [] };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    await fetch(`${API}/groups/${encodeURIComponent(group.id)}/replies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
  }
  const open = (id: string) => { setSelected(id); setExpanded(true); };
  async function markRead(id: string) {
    markNotificationRead(id);
    await fetch(`${API}/notifications/${id}`, { method: "PATCH" });
  }

  if (!group) return <main className="grid min-h-screen place-items-center bg-black text-[#71767b]">Loading Mitot…</main>;

  const visible = order.filter((k) => !hidden.includes(k));

  return (
    <main className="flex h-screen overflow-hidden bg-black text-[#e7e9ea]">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-[#1c1c1e] bg-black py-4">
        <div className="mb-2 flex size-9 items-center justify-center rounded-full bg-[#7c6cff] text-sm font-bold text-black">M</div>
        <button title={group.name} className="flex size-10 items-center justify-center rounded-full text-[#e7e9ea] hover:bg-white/[0.08]"><Home className="size-6" /></button>
        <NotificationBell notifications={notifications} onOpen={(id) => id && open(id)} onRead={markRead} />
        <button title="Profile" className="flex size-10 items-center justify-center rounded-full text-[#e7e9ea] hover:bg-white/[0.08]"><User className="size-6" /></button>
      </nav>
      <div className="flex min-h-0 flex-1">
        <div ref={columnsRef} className="flex min-w-0 flex-1 overflow-x-auto">
          {visible.map((key) => (
            <Column key={key} colKey={key} items={itemsByKey[key]} selected={selected ?? undefined} open={open} onHide={() => setHidden((h) => [...h, key])} />
          ))}
          <AddColumnTile hidden={hidden} onAdd={(key) => setHidden((h) => h.filter((k) => k !== key))} />
        </div>
        {active && (
          <aside className={`flex shrink-0 flex-col overflow-hidden border-l border-[#1c1c1e] bg-black transition-[width] duration-300 ease-out ${expanded ? "w-[420px]" : "w-12"}`}>
            <button onClick={() => setExpanded(!expanded)} className="flex h-12 shrink-0 items-center justify-center border-b border-[#1c1c1e] text-[#7c6cff]" title={expanded ? "Collapse details" : "Expand details"}>
              {expanded ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
            </button>
            <div className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${expanded ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              <header className="border-b border-[#1c1c1e] p-5">
                <p className="flex items-center gap-1.5 text-xs text-[#7c6cff]"><Sparkles className="size-3.5" />ACTIVE DISCUSSION</p>
                <h1 className="mt-2 text-lg font-semibold">{active.title}</h1>
                <p className="mt-2 text-sm text-[#8b98a5]">{active.summary}</p>
                {active.nextAction && <p className="mt-3 flex items-start gap-1.5 text-xs text-[#f2b705]"><Clock3 className="mt-0.5 size-3.5 shrink-0" />{active.nextAction}</p>}
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {active.messages.map((m) => (
                  <article key={m.id} className="mb-5 flex gap-2.5">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-black" style={{ backgroundColor: avatarColor(m.senderName) }}>{m.senderName.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm"><b>{m.senderName}</b> <span className="text-xs text-[#5b5f63]">{relTime(m.timestamp)}</span></p>
                      <p className="mt-0.5 text-sm leading-6 text-[#c6c8cb]">{m.content}</p>
                      {m.metadata?.media && <MediaPreview media={m.metadata.media} />}
                    </div>
                  </article>
                ))}
              </div>
              <form onSubmit={send} className="border-t border-[#1c1c1e] p-3">
                <div className="flex items-center rounded-full border border-[#2f3336] focus-within:border-[#7c6cff]">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none" placeholder="Reply to WhatsApp" />
                  <button className="px-4 text-[#7c6cff]"><Send className="size-4" /></button>
                </div>
              </form>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
