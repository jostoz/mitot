"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronLeft, ChevronRight, Clock3, FileText, Home, LayoutGrid, MessageCircle, MoreHorizontal, Repeat2, Send, Sparkles, User, X } from "lucide-react";
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
  if (media.kind === "IMAGE" || media.kind === "STICKER") return <img src={src} alt="Adjunto" className="mt-2 max-h-64 w-full rounded-xl border border-[#1c1c1e] object-contain sm:w-auto" />;
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
    <article className={`border-b border-[#1c1c1e] px-3 py-3 sm:px-4 ${selected ? "bg-white/[0.04]" : "active:bg-white/[0.04] sm:hover:bg-white/[0.02]"}`}>
      <button onClick={open} className="flex w-full gap-2.5 text-left sm:gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-black sm:size-9" style={{ backgroundColor: color }}>{item.title.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] sm:text-[15px]">
            <b className="truncate">{item.title}</b>
            <span className="shrink-0 text-[#5b5f63]">·</span>
            <span className="shrink-0 text-[#5b5f63]">{relTime(item.lastActivityAt)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-[#c6c8cb] sm:text-[14px]">{item.summary ?? last.content}</p>
          {last.metadata?.media && <MediaPreview media={last.metadata.media} />}
        </div>
      </button>
      <div className="mt-2.5 flex items-center gap-5 pl-[42px] text-[#71767b] sm:pl-12">
        <button onClick={() => setReply(!reply)} title="Reply" className="flex items-center gap-1.5 py-1 hover:text-[#7c6cff]"><MessageCircle className="size-[18px]" /><span className="text-xs">{item.messages.length}</span></button>
        <button onClick={() => setFollow(!follow)} title="Follow-up" className="py-1 hover:text-[#7c6cff]"><Repeat2 className="size-[19px]" /></button>
        <button onClick={open} title="Open" className="py-1 hover:text-[#7c6cff]"><ChevronRight className="size-[18px]" /></button>
      </div>
      {follow && (
        <form onSubmit={(e) => { e.preventDefault(); void update({ nextAction: next }); setFollow(false); }} className="ml-[42px] mt-2.5 flex gap-2 sm:ml-12">
          <input autoFocus value={next} onChange={(e) => setNext(e.target.value)} className="min-w-0 flex-1 rounded-full border border-[#2f3336] bg-transparent px-3 py-1.5 text-xs outline-none focus:border-[#7c6cff]" placeholder="Next action…" />
          <button className="shrink-0 rounded-full bg-[#7c6cff] px-3 text-xs font-medium text-black">Save</button>
        </form>
      )}
      {reply && (
        <form onSubmit={send} className="ml-[42px] mt-2.5 flex gap-2 sm:ml-12">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded-full border border-[#2f3336] bg-transparent px-3 py-1.5 text-xs outline-none focus:border-[#7c6cff]" placeholder="Reply in WhatsApp…" />
          <button className="shrink-0 rounded-full bg-[#7c6cff] px-3 text-xs font-medium text-black">Send</button>
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

function ColumnBody({ items, selected, open }: { items: Discussion[]; selected?: string; open(id: string): void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {items.length ? items.map((item) => <Card key={item.id} item={item} selected={item.id === selected} open={() => open(item.id)} />) : <p className="p-4 text-xs text-[#5b5f63]">Nothing here.</p>}
    </div>
  );
}

function Column({ colKey, items, selected, open, onHide }: { colKey: ColumnKey; items: Discussion[]; selected?: string; open(id: string): void; onHide(): void }) {
  const [menu, setMenu] = useState(false);
  return (
    <section className="flex h-full w-[340px] shrink-0 flex-col border-r border-[#1c1c1e]">
      <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-[#1c1c1e] px-3">
        <span className="text-[15px] font-semibold">{COLUMN_META[colKey].title}</span>
        <span className="ml-2 text-xs text-[#5b5f63]">{items.length}</span>
        <button onClick={() => setMenu(!menu)} className="absolute right-3 flex size-8 items-center justify-center text-[#71767b] hover:text-white"><MoreHorizontal className="size-[18px]" /></button>
        {menu && (
          <div className="absolute right-3 top-11 z-10 w-40 rounded-xl border border-[#2f3336] bg-[#16181c] p-1 text-sm shadow-xl">
            <button onClick={() => { onHide(); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]"><X className="size-4" />Remove column</button>
          </div>
        )}
      </header>
      <ColumnBody items={items} selected={selected} open={open} />
    </section>
  );
}

function MobileTabs({ visible, tab, setTab }: { visible: ColumnKey[]; tab: ColumnKey; setTab(key: ColumnKey): void }) {
  return (
    <div className="flex h-11 shrink-0 items-center overflow-x-auto border-b border-[#1c1c1e]">
      {visible.map((key) => (
        <button key={key} onClick={() => setTab(key)} className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-[14px] font-medium ${tab === key ? "border-[#7c6cff] text-white" : "border-transparent text-[#71767b]"}`}>
          {COLUMN_META[key].title}
        </button>
      ))}
    </div>
  );
}

function ColumnsMenu({ order, hidden, onToggle }: { order: ColumnKey[]; hidden: ColumnKey[]; onToggle(key: ColumnKey): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} title="Columns" className="flex size-11 items-center justify-center rounded-full text-[#e7e9ea] hover:bg-white/[0.08] lg:size-10">
        <LayoutGrid className="size-6" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="fixed bottom-16 left-2 right-2 z-20 rounded-xl border border-[#2f3336] bg-[#16181c] p-1 shadow-2xl lg:absolute lg:bottom-auto lg:left-14 lg:right-auto lg:top-0 lg:w-64">
            <header className="px-3 py-2 text-xs font-semibold tracking-wide text-[#71767b]">COLUMNS</header>
            {order.map((key) => {
              const visible = !hidden.includes(key);
              return (
                <button key={key} onClick={() => onToggle(key)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/[0.06]">
                  <span className={visible ? "" : "text-[#71767b]"}>{COLUMN_META[key].title}</span>
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded border ${visible ? "border-[#7c6cff] bg-[#7c6cff]" : "border-[#2f3336]"}`}>
                    {visible && <Check className="size-3.5 text-black" />}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function NotificationBell({ notifications, onOpen, onRead }: { notifications: Notification[]; onOpen(id: string | null): void; onRead(id: string): void }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex size-11 items-center justify-center rounded-full text-[#e7e9ea] hover:bg-white/[0.08] lg:size-10">
        <Bell className="size-6" />
        {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-[#ff6c8b] lg:right-1.5 lg:top-1.5" />}
      </button>
      {open && (
        <div className="fixed bottom-16 left-2 right-2 z-20 max-h-[60vh] overflow-y-auto rounded-xl border border-[#2f3336] bg-[#16181c] shadow-2xl lg:absolute lg:bottom-auto lg:left-14 lg:right-auto lg:top-0 lg:max-h-[70vh] lg:w-80">
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
  const [tab, setTab] = useState<ColumnKey>("active");
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
  const close = () => { setExpanded(false); setSelected(null); };
  async function markRead(id: string) {
    markNotificationRead(id);
    await fetch(`${API}/notifications/${id}`, { method: "PATCH" });
  }
  function toggleColumn(key: ColumnKey) {
    const willHide = !hidden.includes(key);
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
    if (willHide && tab === key) {
      const next = order.find((k) => k !== key && !hidden.includes(k));
      if (next) setTab(next);
    } else if (!willHide) {
      setTab(key);
    }
  }

  if (!group) return <main className="grid min-h-screen place-items-center bg-black text-[#71767b]">Loading Mitot…</main>;

  const visible = order.filter((k) => !hidden.includes(k));

  const DetailPanel = active && (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1e] px-3 lg:block lg:h-auto lg:p-5">
        <button onClick={close} className="flex size-9 shrink-0 items-center justify-center text-[#7c6cff] lg:hidden"><ChevronLeft className="size-5" /></button>
        <div className="min-w-0 flex-1 lg:min-w-0">
          <p className="hidden items-center gap-1.5 text-xs text-[#7c6cff] lg:flex"><Sparkles className="size-3.5" />ACTIVE DISCUSSION</p>
          <h1 className="truncate text-[15px] font-semibold lg:mt-2 lg:whitespace-normal lg:text-lg">{active.title}</h1>
          <p className="hidden text-sm text-[#8b98a5] lg:mt-2 lg:block">{active.summary}</p>
          {active.nextAction && <p className="mt-3 hidden items-start gap-1.5 text-xs text-[#f2b705] lg:flex"><Clock3 className="mt-0.5 size-3.5 shrink-0" />{active.nextAction}</p>}
        </div>
      </header>
      <p className="border-b border-[#1c1c1e] px-4 py-2 text-xs text-[#8b98a5] lg:hidden">{active.summary}</p>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
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
    </>
  );

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-black text-[#e7e9ea] lg:flex-row">
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 shrink-0 items-center justify-around border-t border-[#1c1c1e] bg-black lg:static lg:h-auto lg:w-16 lg:flex-col lg:justify-start lg:gap-2 lg:border-t-0 lg:border-r lg:py-4">
        <div className="hidden size-9 items-center justify-center rounded-full bg-[#7c6cff] text-sm font-bold text-black lg:mb-2 lg:flex">M</div>
        <button title={group.name} className="flex size-11 items-center justify-center rounded-full text-[#e7e9ea] hover:bg-white/[0.08] lg:size-10"><Home className="size-6" /></button>
        <ColumnsMenu order={order} hidden={hidden} onToggle={toggleColumn} />
        <NotificationBell notifications={notifications} onOpen={(id) => id && open(id)} onRead={markRead} />
        <button title="Profile" className="flex size-11 items-center justify-center rounded-full text-[#e7e9ea] hover:bg-white/[0.08] lg:size-10"><User className="size-6" /></button>
      </nav>
      <div className="flex min-h-0 flex-1 pb-14 lg:pb-0">
        <div className="flex min-h-0 w-full min-w-0 flex-col lg:hidden">
          <MobileTabs visible={visible} tab={tab} setTab={setTab} />
          <ColumnBody items={itemsByKey[tab]} selected={selected ?? undefined} open={open} />
        </div>
        <div ref={columnsRef} className="hidden min-w-0 flex-1 overflow-x-auto lg:flex">
          {visible.map((key) => (
            <Column key={key} colKey={key} items={itemsByKey[key]} selected={selected ?? undefined} open={open} onHide={() => toggleColumn(key)} />
          ))}
        </div>
        {active && (
          <aside className={`fixed inset-0 z-40 flex flex-col overflow-hidden bg-black lg:static lg:z-auto lg:shrink-0 lg:border-l lg:border-[#1c1c1e] lg:transition-[width] lg:duration-300 lg:ease-out ${expanded ? "lg:w-[420px]" : "lg:w-12"}`}>
            <button onClick={() => setExpanded(!expanded)} className="hidden h-12 shrink-0 items-center justify-center border-b border-[#1c1c1e] text-[#7c6cff] lg:flex" title={expanded ? "Collapse details" : "Expand details"}>
              {expanded ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
            </button>
            <div className={`flex min-h-0 flex-1 flex-col opacity-100 lg:transition-opacity lg:duration-200 ${expanded ? "lg:opacity-100" : "lg:pointer-events-none lg:opacity-0"}`}>
              {DetailPanel}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
