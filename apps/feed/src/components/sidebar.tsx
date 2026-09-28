"use client";

import { useEffect, useRef, useState } from "react";
import { relTime } from "@/lib/api";
import { useDeckStore } from "@/lib/store";
import { isVisibleDiscussion } from "@/lib/discussions";
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
  const [collapsed, setCollapsed] = useState(false);
  const collapseTimer = useRef<number | undefined>(undefined);

  const clearCollapse = () => window.clearTimeout(collapseTimer.current);
  const expand = () => {
    clearCollapse();
    setCollapsed(false);
  };
  const collapseSoon = () => {
    clearCollapse();
    collapseTimer.current = window.setTimeout(() => setCollapsed(true), 2500);
  };

  useEffect(() => {
    collapseTimer.current = window.setTimeout(() => setCollapsed(true), 4000);
    return clearCollapse;
  }, []);

  const visibleDiscussions = discussions.filter(isVisibleDiscussion);
  const unread = notifications.filter((item) => !item.read).length;
  const active = visibleDiscussions.filter((item) => item.status === "ACTIVE" || item.status === "PROPOSED").length;
  const resolved = visibleDiscussions.filter((item) => item.status === "RESOLVED").length;
  const healthy = ingestStatus?.state === "open";
  const statusLabel = !ingestStatus
    ? "Comprobando WhatsApp…"
    : ingestStatus.state === "open"
      ? "WhatsApp conectado"
      : ingestStatus.state === "unreachable"
        ? "Listener inalcanzable"
        : "WhatsApp desconectado";
  const messages = visibleDiscussions.reduce((total, item) => total + item.messages.length, 0);

  return (
    <aside
      onMouseEnter={expand}
      onMouseLeave={collapseSoon}
      onFocusCapture={expand}
      onBlurCapture={collapseSoon}
      className={`hidden h-full shrink-0 flex-col gap-1 overflow-y-auto border-r border-line-soft bg-bg pb-6 pt-3.5 transition-[width,padding] duration-200 lg:flex ${
        collapsed ? "w-[62px] px-2" : "w-[205px] px-2.5"
      }`}
    >
      <div className={`mb-3 flex items-center ${collapsed ? "justify-center" : "justify-between px-1.5"}`}>
        <div className="flex items-center gap-2 text-fg">
          <LogoMark className="h-7 w-7 shrink-0" />
          {collapsed ? null : <span className="text-[19px] font-bold tracking-tight">mitot</span>}
        </div>
        {collapsed ? null : (
          <button
            type="button"
            aria-label="Colapsar barra lateral"
            onClick={() => setCollapsed(true)}
            className="rounded-full p-1.5 text-fg-2 transition-colors hover:bg-white/8 hover:text-fg"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {collapsed ? (
        <button
          type="button"
          aria-label="Expandir barra lateral"
          onClick={expand}
          className="grid h-9 w-full place-items-center rounded-[10px] text-fg-2 transition-colors hover:bg-white/8 hover:text-fg"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      ) : null}

      <Row icon={<HomeIcon className="h-[21px] w-[21px]" filled />} label="Deck" value={String(visibleDiscussions.length)} active collapsed={collapsed} />
      <Row icon={<SearchIcon className="h-[21px] w-[21px]" />} label="Activas" value={String(active)} collapsed={collapsed} />
      <Row icon={<HeartIcon className="h-[21px] w-[21px]" />} label="Actividad" value={unread ? String(unread) : ""} collapsed={collapsed} />
      <Row icon={<CheckIcon className="h-[21px] w-[21px]" />} label="Resueltas" value={String(resolved)} collapsed={collapsed} />
      <Row icon={<ChartIcon className="h-[21px] w-[21px]" />} label="Mensajes" value={String(messages)} collapsed={collapsed} />

      {collapsed ? null : <p className="mt-5 px-2.5 pb-1 text-[13px] text-fg-3">Grupos</p>}
      {groups.length ? (
        groups.map((item) => (
          <button
            key={item.id}
            type="button"
            title={collapsed ? item.name : undefined}
            aria-label={collapsed ? item.name : undefined}
            onClick={() => setGroup(item)}
            className={`flex items-center rounded-[10px] py-2 text-left text-[14px] transition-colors ${
              collapsed ? "justify-center px-2.5" : "gap-3 px-2.5"
            } ${group?.id === item.id ? "bg-white/8 font-semibold text-fg" : "text-fg-2 hover:bg-white/5 hover:text-fg"}`}
          >
            <BookmarkIcon className="h-[19px] w-[19px] shrink-0" filled={group?.id === item.id} />
            {collapsed ? null : <span className="truncate">{item.name}</span>}
          </button>
        ))
      ) : collapsed ? null : (
        <p className="px-2.5 py-2 text-[13px] text-fg-3">Sin grupos activos.</p>
      )}

      {group?.columns.length ? (
        <>
          {collapsed ? null : <p className="mt-5 px-2.5 pb-1 text-[13px] text-fg-3">Categorías</p>}
          {group.columns.map((column) => (
            <div
              key={column.id}
              title={collapsed ? column.title : undefined}
              className={`flex items-center rounded-[10px] py-2 text-[14px] text-fg-2 ${collapsed ? "justify-center px-2.5" : "gap-3 px-2.5"}`}
            >
              <ArchiveIcon className="h-[19px] w-[19px] shrink-0" />
              {collapsed ? null : <span className="truncate">{column.title}</span>}
            </div>
          ))}
        </>
      ) : null}

      <div className="mt-auto pt-5">
        <div
          title={collapsed ? statusLabel : undefined}
          className={`flex rounded-[12px] border border-line bg-panel ${collapsed ? "justify-center px-2.5 py-3" : "items-start gap-2 px-2.5 py-2.5"}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${collapsed ? "" : "mt-1"} ${healthy ? "bg-emerald-400" : "bg-danger"}`} />
          {collapsed ? null : (
            <div className="min-w-0">
              <p className={`text-[13px] ${healthy ? "text-emerald-400" : "text-danger"}`}>{statusLabel}</p>
              {ingestStatus?.lastMessageAt ? (
                <p className="mt-0.5 text-[12px] text-fg-3">Último mensaje hace {relTime(ingestStatus.lastMessageAt)}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Row({ icon, label, value, active, collapsed }: { icon: React.ReactNode; label: string; value: string; active?: boolean; collapsed: boolean }) {
  return (
    <div
      title={collapsed ? `${label}${value ? `: ${value}` : ""}` : undefined}
      aria-label={collapsed ? label : undefined}
      className={`flex items-center rounded-[10px] py-2 text-[14px] ${
        collapsed ? "justify-center px-2.5" : "gap-3 px-2.5"
      } ${active ? "bg-white/8 font-semibold text-fg" : "text-fg-2"}`}
    >
      {icon}
      {collapsed ? null : <span className="truncate">{label}</span>}
      {collapsed || !value ? null : <span className="ml-auto text-[13px] text-fg-3">{value}</span>}
    </div>
  );
}
