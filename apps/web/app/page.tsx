"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Inbox, MessageCircle, Send, Sparkles } from "lucide-react";
import { type Discussion, type Group, useDeckStore } from "./store";
const API = "/api";

function Card({ item, selected, open }: { item: Discussion; selected: boolean; open(): void }) {
  const [reply, setReply] = useState(false), [draft, setDraft] = useState(""), [follow, setFollow] = useState(false), [next, setNext] = useState("");
  const last = item.messages[item.messages.length - 1]!;
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
    <article className={`border-b border-[#33343a] p-3 ${selected ? "bg-[#36373d]" : "hover:bg-[#323338]"}`}>
      <button onClick={open} className="w-full text-left">
        <div className="flex gap-2">
          <CircleDot className="mt-0.5 size-4 shrink-0 text-[#7c6cff]" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <b className="truncate text-sm">{item.title}</b>
              <span className="text-xs text-[#92939b]">{item.messages.length}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#b5b5ba]">{item.summary ?? last.content}</p>
          </div>
        </div>
      </button>
      <div className="mt-3 flex gap-2 text-xs">
        <button onClick={() => setReply(!reply)} className="rounded bg-[#3b3c43] px-2 py-1">Reply</button>
        <button onClick={() => setFollow(!follow)} className="rounded bg-[#3b3c43] px-2 py-1">Follow-up</button>
        <button onClick={() => void update({ status: "RESOLVED" })} className="rounded px-2 py-1 text-[#aeadff]">Resolve</button>
        <button onClick={open} className="rounded px-2 py-1 text-[#aeadff]">Open</button>
      </div>
      {follow && (
        <form onSubmit={(e) => { e.preventDefault(); void update({ nextAction: next, status: "ACTIVE" }); setFollow(false); }} className="mt-3 flex gap-2">
          <input autoFocus value={next} onChange={(e) => setNext(e.target.value)} className="min-w-0 flex-1 rounded border border-[#51525a] bg-[#202126] px-2 py-1.5 text-xs outline-none" placeholder="Next action…" />
          <button className="rounded bg-[#7c6cff] px-2 text-xs">Save</button>
        </form>
      )}
      {reply && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded border border-[#51525a] bg-[#202126] px-2 py-1.5 text-xs outline-none" placeholder="Reply in WhatsApp…" />
          <button className="rounded bg-[#7c6cff] px-2 text-xs">Send</button>
        </form>
      )}
    </article>
  );
}

function Column({ title, icon: Icon, items, selected, open }: { title: string; icon: typeof Inbox; items: Discussion[]; selected?: string; open(id: string): void }) {
  return (
    <section className="flex h-full w-[320px] shrink-0 flex-col border-r border-[#25262b] bg-[#28292e]">
      <header className="flex h-11 items-center justify-between border-b border-[#202126] bg-[#2d2e33] px-3">
        <span className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-[#aeadff]" />{title}</span>
        <span className="text-xs text-[#9697a0]">{items.length}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length ? items.map((item) => <Card key={item.id} item={item} selected={item.id === selected} open={() => open(item.id)} />) : <p className="p-4 text-xs text-[#93949d]">Nothing here.</p>}
      </div>
    </section>
  );
}

export default function Page() {
  const { group, discussions, setGroup, setDiscussions } = useDeckStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const groupIdRef = useRef<string | null>(null);

  async function loadDiscussions(groupId: string) {
    const data: Discussion[] = await fetch(`${API}/groups/${encodeURIComponent(groupId)}/discussions`).then((r) => r.json());
    setDiscussions(data);
  }

  useEffect(() => {
    void (async () => {
      const groups: Group[] = await fetch(`${API}/groups`).then((r) => r.json());
      if (!groups[0]) return;
      setGroup(groups[0]);
      groupIdRef.current = groups[0].id;
      await loadDiscussions(groups[0].id);
    })();
    const url = new URL(`${API}/events`, window.location.origin);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    let timer: number | undefined;
    ws.onmessage = () => {
      if (!groupIdRef.current) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => void loadDiscussions(groupIdRef.current!), 500);
    };
    return () => { ws.close(); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const active = discussions.find((d) => d.id === selected);
  const activeDiscussions = discussions.filter((d) => d.status === "ACTIVE");
  const needsResponse = activeDiscussions.filter((d) => /\?$/.test(d.messages[d.messages.length - 1]?.content.trim() ?? ""));
  const resolved = discussions.filter((d) => d.status === "RESOLVED");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    await fetch(`${API}/groups/${encodeURIComponent(group.id)}/replies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
  }
  const open = (id: string) => { setSelected(id); setExpanded(true); };

  if (!group) return <main className="grid min-h-screen place-items-center bg-[#1d1e22] text-[#aaa]">Loading Mitot…</main>;

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#1d1e22] text-[#e9e9ec]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#24252a] bg-[#232429] px-4">
        <b className="rounded bg-[#7c6cff] px-2 py-1">M</b>
        <div><b className="text-sm">Mitot</b><p className="text-[10px] text-[#92939b]">{group.name}</p></div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          <Column title="Mentions" icon={Bell} items={[]} selected={selected ?? undefined} open={open} />
          <Column title="Active discussions" icon={MessageCircle} items={activeDiscussions} selected={selected ?? undefined} open={open} />
          <Column title="Needs response" icon={Sparkles} items={needsResponse} selected={selected ?? undefined} open={open} />
          <Column title="Resolved" icon={CheckCircle2} items={resolved} selected={selected ?? undefined} open={open} />
        </div>
        {active && (
          <aside className={`flex shrink-0 flex-col overflow-hidden border-l border-[#303137] bg-[#202126] transition-[width] duration-300 ease-out ${expanded ? "w-[480px]" : "w-12"}`}>
            <button onClick={() => setExpanded(!expanded)} className="flex h-12 shrink-0 items-center justify-center border-b border-[#303137] text-[#aeadff]" title={expanded ? "Collapse details" : "Expand details"}>
              {expanded ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
            </button>
            <div className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${expanded ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              <header className="border-b border-[#303137] p-5">
                <p className="text-xs text-[#aeadff]">ACTIVE DISCUSSION</p>
                <h1 className="mt-2 text-lg font-semibold">{active.title}</h1>
                <p className="mt-2 text-sm text-[#aaaab1]">{active.summary}</p>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {active.messages.map((m) => (
                  <article key={m.id} className="mb-5">
                    <p className="text-sm"><b>{m.senderName}</b></p>
                    <p className="mt-1 text-sm leading-6 text-[#ceced2]">{m.content}</p>
                  </article>
                ))}
              </div>
              <form onSubmit={send} className="border-t border-[#303137] p-3">
                <div className="flex rounded border border-[#3b3c43]">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 bg-transparent p-3 text-sm outline-none" placeholder="Reply to WhatsApp" />
                  <button className="px-3 text-[#aeadff]"><Send className="size-4" /></button>
                </div>
              </form>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
