"use client";

import { relTime } from "@/lib/api";
import { useDeckStore } from "@/lib/store";
import {
  ArchiveIcon,
  BookmarkIcon,
  ChartIcon,
  CheckIcon,
  HeartIcon,
  HomeIcon,
  LogoMark,
  MenuIcon,
  SearchIcon,
} from "@/components/icons";

export function Sidebar() {
  const group = useDeckStore((state) => state.group);
  const groups = useDeckStore((state) => state.groups);
  const setGroup = useDeckStore((state) => state.setGroup);
  const discussions = useDeckStore((state) => state.discussions);
  const notifications = useDeckStore((state) => state.notifications);
  const ingestStatus = useDeckStore((state) => state.ingestStatus);

  const unread = notifications.filter((item) => !item.read).length;
  const active = discussions.filter((item) => item.status === "ACTIVE" || item.status === "PROPOSED").length;
  const resolved = discussions.filter((item) => item.status === "RESOLVED").length;
  const healthy = ingestStatus?.state === "open";
  const statusLabel = !ingestStatus
    ? "Comprobando WhatsApp…"
    : ingestStatus.state === "open"
      ? "WhatsApp conectado"
      : ingestStatus.state === "unreachable"
        ? "Listener inalcanzable"
        : "WhatsApp desconectado";

  return (
    <aside className="hidden h-full w-[205px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line-soft bg-bg px-2.5 pb-6 pt-3.5 lg:flex">
      <div className="mb-3 flex items-center justify-between px-1.5">
        <div className="flex items-center gap-2 text-fg">
          <LogoMark className="h-7 w-7" />
          <span className="text-[19px] font-bold tracking-tight">mitot</span>
        </div>
        <button type="button" aria-label="Menú" className="rounded-full p-1.5 text-fg-2 transition-colors hover:bg-white/8 hover:text-fg">
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      <Row icon={<HomeIcon className="h-[21px] w-[21px]" filled />} label="Deck" value={String(discussions.length)} active />
      <Row icon={<SearchIcon className="h-[21px] w-[21px]" />} label="Activas" value={String(active)} />
      <Row icon={<HeartIcon className="h-[21px] w-[21px]" />} label="Actividad" value={unread ? String(unread) : ""} />
      <Row icon={<CheckIcon className="h-[21px] w-[21px]" />} label="Resueltas" value={String(resolved)} />
      <Row icon={<ChartIcon className="h-[21px] w-[21px]" />} label="Mensajes" value={String(discussions.reduce((total, item) => total + item.messages.length, 0))} />

      <p className="mt-5 px-2.5 pb-1 text-[13px] text-fg-3">Grupos</p>
      {groups.length ? (
        groups.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setGroup(item)}
            className={`flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-left text-[14px] transition-colors ${
              group?.id === item.id ? "bg-white/8 font-semibold text-fg" : "text-fg-2 hover:bg-white/5 hover:text-fg"
            }`}
          >
            <BookmarkIcon className="h-[19px] w-[19px]" filled={group?.id === item.id} />
            <span className="truncate">{item.name}</span>
          </button>
        ))
      ) : (
        <p className="px-2.5 py-2 text-[13px] text-fg-3">Sin grupos activos.</p>
      )}

      {group?.columns.length ? (
        <>
          <p className="mt-5 px-2.5 pb-1 text-[13px] text-fg-3">Categorías</p>
          {group.columns.map((column) => (
            <div key={column.id} className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[14px] text-fg-2">
              <ArchiveIcon className="h-[19px] w-[19px]" />
              <span className="truncate">{column.title}</span>
            </div>
          ))}
        </>
      ) : null}

      <div className="mt-auto pt-5">
        <div className="flex items-start gap-2 rounded-[12px] border border-line bg-panel px-2.5 py-2.5">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${healthy ? "bg-emerald-400" : "bg-danger"}`} />
          <div className="min-w-0">
            <p className={`text-[13px] ${healthy ? "text-emerald-400" : "text-danger"}`}>{statusLabel}</p>
            {ingestStatus?.lastMessageAt ? (
              <p className="mt-0.5 text-[12px] text-fg-3">Último mensaje hace {relTime(ingestStatus.lastMessageAt)}</p>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Row({ icon, label, value, active }: { icon: React.ReactNode; label: string; value: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[14px] ${
        active ? "bg-white/8 font-semibold text-fg" : "text-fg-2"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {value ? <span className="ml-auto text-[13px] text-fg-3">{value}</span> : null}
    </div>
  );
}
