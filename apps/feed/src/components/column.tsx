"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreIcon } from "@/components/icons";

export type ColumnControls = {
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onRemove?: () => void;
  onDragPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
  dragging?: boolean;
  dropTarget?: boolean;
};

type Props = {
  title: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: number;
  controls?: ColumnControls;
};

export function Column({ title, leading, actions, children, width = 352, controls }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <div
      className={`flex h-full shrink-0 flex-col transition-all ${
        controls?.dragging ? "scale-[0.985] opacity-40 grayscale" : ""
      }`}
      style={{ width }}
    >
      <header
        data-column-header
        onPointerDown={controls?.onDragPointerDown}
        className={`flex h-[54px] shrink-0 select-none items-center gap-2 rounded-[12px] px-3 transition-colors ${
          controls?.onDragPointerDown ? "cursor-grab active:cursor-grabbing" : ""
        } ${controls?.dropTarget ? "bg-white/10" : ""}`}
      >
        {leading}
        <h2 className="truncate text-[15px] font-semibold">{title}</h2>
        <div className="relative ml-auto flex items-center gap-1 text-fg-2" ref={menuRef}>
          {actions}
          <button
            type="button"
            aria-label="Opciones de columna"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-8 w-8 place-items-center rounded-full border border-line transition-colors hover:bg-white/8 hover:text-fg"
          >
            <MoreIcon className="h-[15px] w-[15px]" />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-9 z-30 w-[188px] overflow-hidden rounded-[14px] border border-line bg-elevated py-1 text-[14px] text-fg shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
              <MenuItem
                label="Mover a la izquierda"
                disabled={!controls?.onMoveLeft}
                onClick={() => {
                  controls?.onMoveLeft?.();
                  setMenuOpen(false);
                }}
              />
              <MenuItem
                label="Mover a la derecha"
                disabled={!controls?.onMoveRight}
                onClick={() => {
                  controls?.onMoveRight?.();
                  setMenuOpen(false);
                }}
              />
              <MenuItem
                label="Quitar columna"
                danger
                disabled={!controls?.onRemove}
                onClick={() => {
                  controls?.onRemove?.();
                  setMenuOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>
      </header>
      <section
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-t-[22px] border border-b-0 bg-panel transition-colors ${
          controls?.dropTarget ? "border-accent bg-accent/8" : "border-line-soft"
        }`}
      >
        {children}
      </section>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3.5 py-2 text-left transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:text-fg-3 disabled:hover:bg-transparent ${
        danger ? "text-danger" : ""
      }`}
    >
      {label}
    </button>
  );
}

export function Tabs({ items, value, onChange }: { items: string[]; value: string; onChange: (next: string) => void }) {
  return (
    <div className="sticky top-0 z-10 flex border-b border-line bg-panel/95 backdrop-blur">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`relative flex-1 px-2 py-3 text-[14px] transition-colors ${
            value === item ? "font-semibold text-fg" : "text-fg-3 hover:text-fg-2"
          }`}
        >
          {item}
          <span
            className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg transition-opacity ${
              value === item ? "opacity-100" : "opacity-0"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
