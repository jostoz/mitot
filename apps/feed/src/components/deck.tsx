"use client";

import { useRef, useState } from "react";
import type { ColumnControls } from "@/components/column";
import {
  DetailColumn,
  DiscussionListColumn,
  NotificationsColumn,
  SearchColumn,
  StatsColumn,
  columnCatalog,
  type ColumnKind,
} from "@/components/columns";
import { PlusIcon } from "@/components/icons";
import { useDeckStore } from "@/lib/store";

/**
 * `discussionId` solo aplica a columnas "pinned": cada discusión fijada tiene su propia
 * columna instanciada (título = título de la discusión), como una columna de TweetDeck
 * fijada a un usuario/búsqueda concreto — no es una lista genérica compartida.
 */
type DeckColumnState = { id: string; kind: ColumnKind; discussionId?: string };

export function Deck() {
  const discussions = useDeckStore((state) => state.discussions);
  const [columns, setColumns] = useState<DeckColumnState[]>([
    { id: "c1", kind: "active" },
    { id: "c2", kind: "needsResponse" },
    { id: "c3", kind: "notifications" },
    { id: "c4", kind: "detail" },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<"left" | "right">("left");
  const [ghost, setGhost] = useState<{ x: number; y: number; grabX: number; grabY: number } | null>(null);
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const nextId = useRef(5);
  const slots = useRef(new Map<string, HTMLDivElement>());

  const selected = discussions.find((item) => item.id === selectedId) ?? null;

  const openDiscussion = (id: string) => {
    setSelectedId(id);
    setColumns((current) =>
      current.some((column) => column.kind === "detail")
        ? current
        : [...current, { id: `c${nextId.current++}`, kind: "detail" }],
    );
  };

  /** Agrega esta discusión como su propia columna en el deck. Sin estado en el servidor: es puro layout local. */
  const pinDiscussion = (discussionId: string) => {
    setColumns((current) =>
      current.some((column) => column.kind === "pinned" && column.discussionId === discussionId)
        ? current
        : [...current, { id: `c${nextId.current++}`, kind: "pinned", discussionId }],
    );
  };


  const move = (id: string, delta: number) =>
    setColumns((current) => {
      const index = current.findIndex((column) => column.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const startDrag = (id: string, event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, a")) return;
    event.preventDefault();
    const columnRect = slots.current.get(id)?.getBoundingClientRect();
    const grabX = columnRect ? event.clientX - columnRect.left : 0;
    const grabY = columnRect ? event.clientY - columnRect.top : 0;
    setDragId(id);
    setOverId(id);
    setGhost({ x: event.clientX, y: event.clientY, grabX, grabY });
    document.body.style.cursor = "grabbing";

    const hitTest = (clientX: number) => {
      for (const [columnId, element] of slots.current) {
        const rect = element.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right) {
          return { columnId, side: clientX < rect.left + rect.width / 2 ? ("left" as const) : ("right" as const) };
        }
      }
      return null;
    };

    const onMove = (moveEvent: PointerEvent) => {
      setGhost({ x: moveEvent.clientX, y: moveEvent.clientY, grabX, grabY });
      const hit = hitTest(moveEvent.clientX);
      setOverId(hit?.columnId ?? null);
      if (hit) setDropSide(hit.side);
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      const hit = hitTest(upEvent.clientX);
      setDragId(null);
      setOverId(null);
      setGhost(null);
      if (!hit || hit.columnId === id) return;
      setColumns((current) => {
        const from = current.findIndex((column) => column.id === id);
        const to = current.findIndex((column) => column.id === hit.columnId);
        if (from < 0 || to < 0) return current;
        const next = [...current];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const insert = (index: number, kind: ColumnKind) => {
    setColumns((current) => {
      const next = [...current];
      next.splice(index, 0, { id: `c${nextId.current++}`, kind });
      return next;
    });
    setPickerAt(null);
  };

  const renderColumn = (column: DeckColumnState, controls: ColumnControls | undefined) => {
    const { kind } = column;
    if (kind === "search") return <SearchColumn controls={controls} selectedId={selectedId} onOpen={openDiscussion} />;
    if (kind === "notifications") return <NotificationsColumn controls={controls} onOpen={openDiscussion} />;
    if (kind === "detail") {
      return (
        <DetailColumn
          controls={controls}
          discussion={selected}
          onClose={() => setSelectedId(null)}
          onPin={selected ? () => pinDiscussion(selected.id) : undefined}
        />
      );
    }
    if (kind === "pinned") {
      const pinned = discussions.find((item) => item.id === column.discussionId) ?? null;
      return <DetailColumn controls={controls} discussion={pinned} onClose={() => {}} hideBack />;
    }
    if (kind === "stats") return <StatsColumn controls={controls} />;
    return <DiscussionListColumn kind={kind} controls={controls} selectedId={selectedId} onOpen={openDiscussion} />;
  };

  const removeColumn = (column: DeckColumnState) => {
    setColumns((current) => current.filter((item) => item.id !== column.id));
  };

  return (
    <div className="flex h-full gap-1 overflow-x-auto px-2.5 pt-1.5">
      <AddSlot
        index={0}
        open={pickerAt === 0}
        onToggle={() => setPickerAt((current) => (current === 0 ? null : 0))}
        onPick={insert}
      />

      {columns.map((column, index) => {
        const isTarget = Boolean(dragId) && overId === column.id && dragId !== column.id;
        return (
          <div
            key={column.id}
            className="relative flex h-full"
            ref={(element) => {
              if (element) slots.current.set(column.id, element);
              else slots.current.delete(column.id);
            }}
          >
            {isTarget ? (
              <span
                aria-hidden
                className={`pointer-events-none absolute top-[48px] bottom-0 z-30 w-[3px] rounded-full bg-accent shadow-[0_0_12px_2px_rgba(58,123,253,0.65)] ${
                  dropSide === "left" ? "left-[-3px]" : "right-[9px]"
                }`}
              />
            ) : null}

            {renderColumn(column, {
              onMoveLeft: index > 0 ? () => move(column.id, -1) : undefined,
              onMoveRight: index < columns.length - 1 ? () => move(column.id, 1) : undefined,
              onRemove: columns.length > 1 ? () => removeColumn(column) : undefined,
              onDragPointerDown: (event) => startDrag(column.id, event),
              dragging: dragId === column.id,
              dropTarget: isTarget,
            })}

            <AddSlot
              index={index + 1}
              open={pickerAt === index + 1}
              onToggle={() => setPickerAt((current) => (current === index + 1 ? null : index + 1))}
              onPick={insert}
            />
          </div>
        );
      })}

      <div className="w-2 shrink-0" />

      {dragId && ghost ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 origin-top-left rotate-[1.5deg]"
          style={{ left: ghost.x - ghost.grabX, top: ghost.y - ghost.grabY, height: "calc(100dvh - 8px)" }}
        >
          <div className="h-full overflow-hidden rounded-t-[22px] border-2 border-accent bg-bg shadow-[0_24px_60px_rgba(0,0,0,0.85)]">
            {renderColumn(columns.find((column) => column.id === dragId)!, undefined)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddSlot({
  index,
  open,
  onToggle,
  onPick,
}: {
  index: number;
  open: boolean;
  onToggle: () => void;
  onPick: (index: number, kind: ColumnKind) => void;
}) {
  return (
    <div className="group/slot relative flex h-full w-4 shrink-0 items-start justify-center pt-[11px]">
      <span className="pointer-events-none absolute top-[54px] bottom-0 w-px bg-transparent transition-colors group-hover/slot:bg-line" />
      <button
        type="button"
        aria-label="Agregar columna aquí"
        aria-expanded={open}
        onClick={onToggle}
        className={`grid h-8 w-8 place-items-center rounded-full border border-line bg-elevated text-fg-2 transition-all hover:text-fg ${
          open ? "opacity-100" : "opacity-0 group-hover/slot:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <PlusIcon className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute left-1/2 top-12 z-40 w-[268px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-line bg-elevated py-1 shadow-[0_14px_36px_rgba(0,0,0,0.65)]">
          <p className="px-3.5 py-2 text-[13px] text-fg-3">Agregar columna</p>
          {columnCatalog.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => onPick(index, item.kind)}
              className="block w-full px-3.5 py-2 text-left transition-colors hover:bg-white/8"
            >
              <span className="block text-[14px] font-semibold text-fg">{item.label}</span>
              <span className="block text-[12px] text-fg-3">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
