"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Column, Tabs, type ColumnControls } from "@/components/column";
import { DiscussionCard } from "@/components/discussion-card";
import { Avatar, LinkPreviewCard, MediaPreview, RichText } from "@/components/primitives";
import { BackIcon, MoreIcon, PinIcon, SearchIcon, ShareIcon } from "@/components/icons";
import { api, relTime, type DeckMessage, type Discussion, type ObservabilityVersion } from "@/lib/api";
import { useDeckStore } from "@/lib/store";

/** Debe coincidir con OFF_TOPIC_TITLE del worker: el bucket de ruido no es publicable. */
const OFF_TOPIC_TITLE = "🎲 Sin tema";

export type ColumnKind = "active" | "needsResponse" | "resolved" | "pinned" | "notifications" | "search" | "detail" | "stats";

export const columnCatalog: { kind: ColumnKind; label: string; hint: string }[] = [
  { kind: "active", label: "Discusiones activas", hint: "Hilos con status ACTIVE" },
  { kind: "needsResponse", label: "Necesitan respuesta", hint: "El último mensaje es una pregunta" },
  { kind: "resolved", label: "Resueltas", hint: "Hilos con status RESOLVED" },
  { kind: "notifications", label: "Notificaciones", hint: "Menciones, follow-ups y nuevas discusiones" },
  { kind: "search", label: "Búsqueda", hint: "Filtra discusiones por texto" },
  { kind: "detail", label: "Discusión abierta", hint: "Mensajes completos y respuesta" },
  { kind: "stats", label: "Estadísticas", hint: "Confianza del matcher y tasa de corrección manual" },
];

function useDiscussionsByKind(kind: ColumnKind) {
  const discussions = useDeckStore((state) => state.discussions);
  return useMemo(() => {
    if (kind === "resolved") return discussions.filter((item) => item.status === "RESOLVED");
    const active = discussions.filter((item) => item.status === "ACTIVE" || item.status === "PROPOSED");
    if (kind === "needsResponse") {
      return active.filter((item) => /\?$/.test(item.messages.at(-1)?.content.trim() ?? ""));
    }
    return active;
  }, [discussions, kind]);
}

type ListProps = { controls?: ColumnControls; selectedId: string | null; onOpen: (id: string) => void };

export function DiscussionListColumn({ kind, controls, selectedId, onOpen }: ListProps & { kind: ColumnKind }) {
  const items = useDiscussionsByKind(kind);
  const label = columnCatalog.find((item) => item.kind === kind)!.label;

  return (
    <Column
      title={
        <span className="flex items-baseline gap-2">
          {label}
          <span className="text-[13px] font-normal text-fg-3">{items.length}</span>
        </span>
      }
      width={340}
      controls={controls}
    >
      {items.length ? (
        items.map((item) => (
          <DiscussionCard key={item.id} discussion={item} selected={item.id === selectedId} onOpen={() => onOpen(item.id)} />
        ))
      ) : (
        <EmptyState label="No hay discusiones aquí." />
      )}
    </Column>
  );
}

export function SearchColumn({ controls, selectedId, onOpen }: ListProps) {
  const discussions = useDeckStore((state) => state.discussions);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? discussions.filter(
        (item) =>
          item.title.toLowerCase().includes(normalized) ||
          (item.summary ?? "").toLowerCase().includes(normalized) ||
          item.messages.some((message) => message.content.toLowerCase().includes(normalized)),
      )
    : discussions;

  return (
    <Column
      title={
        <label className="flex h-9 w-full items-center gap-2 rounded-full border border-line bg-panel-2 px-3">
          <SearchIcon className="h-4 w-4 text-fg-3" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en discusiones"
            aria-label="Buscar en discusiones"
            className="w-full bg-transparent text-[14px] font-normal outline-none placeholder:text-fg-3"
          />
        </label>
      }
      width={340}
      controls={controls}
    >
      {results.length ? (
        results.map((item) => (
          <DiscussionCard key={item.id} discussion={item} selected={item.id === selectedId} onOpen={() => onOpen(item.id)} />
        ))
      ) : (
        <EmptyState label={`Sin resultados para “${query}”.`} />
      )}
    </Column>
  );
}

const notificationTabs = ["Todas", "Sin leer"];

export function NotificationsColumn({ controls, onOpen }: { controls?: ColumnControls; onOpen: (id: string) => void }) {
  const notifications = useDeckStore((state) => state.notifications);
  const markNotificationRead = useDeckStore((state) => state.markNotificationRead);
  const [tab, setTab] = useState(notificationTabs[0]);
  const items = tab === "Sin leer" ? notifications.filter((item) => !item.read) : notifications;

  return (
    <Column title="Actividad" width={332} controls={controls}>
      <Tabs items={notificationTabs} value={tab} onChange={setTab} />
      {items.length ? (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={async () => {
              markNotificationRead(item.id);
              if (item.discussionId) onOpen(item.discussionId);
              await api.readNotification(item.id);
            }}
            className={`flex w-full gap-3 border-b border-line-soft px-4 py-3.5 text-left transition-colors hover:bg-white/4 ${
              item.read ? "opacity-55" : ""
            }`}
          >
            <Avatar name={item.title} size={32} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 text-fg-3">{relTime(item.createdAt)}</span>
              </p>
              <p className="mt-0.5 text-[12px] uppercase tracking-wide text-accent">{item.type}</p>
              {item.body ? <p className="mt-1 line-clamp-3 text-[14px] leading-[19px] text-fg-2">{item.body}</p> : null}
            </div>
            {item.read ? null : <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />}
          </button>
        ))
      ) : (
        <EmptyState label="Sin notificaciones." />
      )}
    </Column>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  INCIDENT: "🛠️ Problemas técnicos",
  TASK: "🚀 Proyectos y colaboraciones",
  DECISION: "📣 Decisiones de comunidad",
  KNOWLEDGE: "📚 Recursos y referencias",
  GENERAL_CHAT: "💬 Hilos abiertos",
  NOISE: "🔇 Sin tema",
};

const METHOD_LABELS: Record<string, string> = {
  citation: "Cita a otro mensaje (determinista)",
  typesafe: "Matcher probabilístico",
  noise: "Descartado como ruido",
};

function pct(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * Sin esto, saber si un cambio de prompt ayuda o empeora depende de que alguien note el
 * error a ojo. Cruza MatchDecision (qué decidió el pipeline, con qué confianza) contra
 * RoutingCorrection (qué corrigió un humano) por versión de prompt.
 */
export function StatsColumn({ controls }: { controls?: ColumnControls }) {
  const groupId = useDeckStore((state) => state.group?.id);
  const [versions, setVersions] = useState<ObservabilityVersion[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setError(false);
    api
      .observability(groupId)
      .then((data) => !cancelled && setVersions(data.versions))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const refresh = () => {
    if (!groupId) return;
    setError(false);
    api.observability(groupId).then((data) => setVersions(data.versions)).catch(() => setError(true));
  };

  return (
    <Column
      title="Estadísticas"
      width={340}
      controls={controls}
      actions={<button type="button" onClick={refresh} className="rounded-full px-2 py-1 text-[12px] font-medium text-accent hover:bg-white/8">Actualizar</button>}
    >
      {error ? (
        <EmptyState label="No se pudieron cargar las estadísticas." />
      ) : !versions ? (
        <EmptyState label="Cargando…" />
      ) : versions.length === 0 ? (
        <EmptyState label="Aún no hay decisiones registradas." />
      ) : (
        versions.map((v) => (
          <div key={v.promptVersion} className="border-b border-line-soft px-4 py-4">
            <p className="truncate text-[13px] font-semibold text-accent" title={v.promptVersion}>
              {v.promptVersion}
            </p>
            <p className="mt-0.5 text-[12px] text-fg-3">{v.total} mensajes procesados</p>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Metric label="Corregidos a mano" value={`${v.correctedCount} (${pct(v.overrideRate)})`} warn={v.overrideRate > 0.1} />
              <Metric label="Confianza promedio" value={pct(v.avgConfidence)} warn={v.avgConfidence !== null && v.avgConfidence < 0.7} />
              <Metric label="Abrió tema nuevo" value={pct(v.newTopicRate)} />
              <Metric label="Decisiones registradas" value={String(v.total)} />
            </div>

            <p className="mt-3.5 text-[12px] font-semibold text-fg-2">Cómo se enrutó</p>
            <div className="mt-1.5 space-y-1">
              {Object.entries(v.methodCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([method, count]) => (
                  <Bar key={method} label={METHOD_LABELS[method] ?? method} count={count} total={v.total} />
                ))}
            </div>

            <p className="mt-3.5 text-[12px] font-semibold text-fg-2">Por categoría</p>
            <div className="mt-1.5 space-y-1">
              {Object.entries(v.categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => (
                  <Bar key={category} label={CATEGORY_LABELS[category] ?? category} count={count} total={v.total} />
                ))}
            </div>
          </div>
        ))
      )}
    </Column>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[10px] bg-panel-2 px-2.5 py-2">
      <p className={`text-[16px] font-bold ${warn ? "text-danger" : "text-fg"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-fg-3">{label}</p>
    </div>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const width = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-fg-2">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-fg-3">{count}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function DetailColumn({
  controls,
  discussion,
  onClose,
  onPin,
  hideBack,
}: {
  controls?: ColumnControls;
  discussion: Discussion | null;
  onClose: () => void;
  onPin?: () => void;
  hideBack?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !discussion) return;
    setSending(true);
    try {
      await api.reply(discussion.groupId, content, discussion.messages.at(-1)?.id);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <Column
      title={discussion ? discussion.title : "Discusión"}
      width={382}
      controls={controls}
      leading={
        hideBack ? null : (
          <button
            type="button"
            aria-label="Cerrar discusión"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-fg-2 transition-colors hover:bg-white/8 hover:text-fg"
          >
            <BackIcon className="h-5 w-5" />
          </button>
        )
      }
    >
      {discussion ? (
        <>
          <div className="border-b border-line-soft px-4 py-3.5">
            <div className="flex items-center gap-2">
              <p className="text-[12px] uppercase tracking-wide text-accent">{discussion.status}</p>
              {discussion.visibility === "PUBLIC" ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  Público
                </span>
              ) : null}
            </div>
            <h3 className="mt-1 text-[19px] font-bold leading-tight">{discussion.title}</h3>
            {discussion.summary ? <p className="mt-2 text-[14px] leading-[19px] text-fg-2">{discussion.summary}</p> : null}
            {discussion.nextAction ? (
              <p className="mt-2.5 flex items-start gap-1.5 text-[13px] text-amber-300">
                <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {discussion.nextAction}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {onPin ? (
                <button
                  type="button"
                  onClick={onPin}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-fg-2 transition-colors hover:bg-white/8 hover:text-fg"
                >
                  <PinIcon className="h-3.5 w-3.5" />
                  Agregar como columna
                </button>
              ) : null}
              <PublishControl discussion={discussion} />
            </div>
          </div>

          <div className="px-4 py-3">
            {discussion.messages.map((message) => (
              <article key={message.id} className="group/message mb-4 flex gap-2.5">
                <Avatar name={message.senderName} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[14px] leading-none">
                    <span className="font-semibold">{message.senderName}</span>
                    <span className="text-[13px] text-fg-3">{relTime(message.timestamp)}</span>
                    <MoveMessageControl message={message} discussion={discussion} />
                  </p>
                  <RichText text={message.content} className="mt-1 text-[15px] leading-[21px] text-fg" />
                  {message.metadata?.media ? <MediaPreview media={message.metadata.media} /> : null}
                  {message.metadata?.preview ? <LinkPreviewCard preview={message.metadata.preview} /> : null}
                </div>
              </article>
            ))}
          </div>

          <form onSubmit={send} className="sticky bottom-0 border-t border-line bg-panel/95 p-3 backdrop-blur">
            <div className="flex items-center rounded-full border border-line focus-within:border-accent">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Responder en WhatsApp"
                className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-[14px] outline-none"
              />
              <button type="submit" disabled={sending} className="px-4 text-accent disabled:opacity-50" aria-label="Enviar respuesta">
                <ShareIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          </form>
        </>
      ) : (
        <EmptyState label="Abre una discusión para ver sus mensajes." />
      )}
    </Column>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="px-4 py-12 text-center text-[14px] text-fg-3">{label}</p>;
}

/** Publica un hilo en la página pública del grupo: el bucle de difusión del producto. */
function PublishControl({ discussion }: { discussion: Discussion }) {
  const patchDiscussion = useDeckStore((state) => state.patchDiscussion);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isPublic = discussion.visibility === "PUBLIC";
  const publicUrl = `/community/${encodeURIComponent(discussion.groupId)}`;
  // El servidor rechaza publicar el bucket de ruido: no ofrezcas la acción.
  const publishable = discussion.title !== OFF_TOPIC_TITLE;

  const toggle = async () => {
    const next = isPublic ? "PRIVATE" : "PUBLIC";
    setBusy(true);
    patchDiscussion(discussion.id, { visibility: next });
    try {
      await api.updateDiscussion(discussion.id, { visibility: next });
    } catch {
      patchDiscussion(discussion.id, { visibility: discussion.visibility });
    } finally {
      setBusy(false);
    }
  };

  if (!publishable) return null;

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
          isPublic ? "border border-line text-fg-2 hover:bg-white/8" : "bg-white text-black hover:opacity-90"
        }`}
      >
        {isPublic ? "Quitar de público" : "Publicar hilo"}
      </button>

      {isPublic ? (
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(new URL(publicUrl, window.location.origin).toString());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-full border border-line px-3 py-1.5 text-[13px] text-fg-2 transition-colors hover:bg-white/8 hover:text-fg"
        >
          {copied ? "Enlace copiado" : "Copiar enlace"}
        </button>
      ) : null}
    </span>
  );
}



/**
 * Corrección manual de enrutado: el clasificador puede equivocarse, y hasta ahora la
 * única forma de arreglarlo era una migración escrita a mano. Cada corrección aquí
 * también queda registrada como caso etiquetado por humano (RoutingCorrection) para
 * evaluar cambios futuros del prompt.
 */
function MoveMessageControl({ message, discussion }: { message: DeckMessage; discussion: Discussion }) {
  const discussions = useDeckStore((state) => state.discussions);
  const moveMessage = useDeckStore((state) => state.moveMessage);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const candidates = discussions.filter((thread) => thread.groupId === discussion.groupId && thread.id !== discussion.id);

  const move = async (toDiscussionId: string | null) => {
    setBusy(true);
    setOpen(false);
    moveMessage(message.id, discussion.id, toDiscussionId);
    try {
      await api.rerouteMessage(message.id, toDiscussionId);
    } catch {
      moveMessage(message.id, toDiscussionId, discussion.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative ml-auto" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        aria-label="Mover mensaje a otro hilo"
        className="rounded-full p-1 text-fg-3 opacity-0 transition-colors hover:bg-white/8 hover:text-fg group-hover/message:opacity-100 disabled:opacity-50"
      >
        <MoreIcon className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="absolute right-0 top-6 z-40 max-h-64 w-[240px] overflow-y-auto rounded-[14px] border border-line bg-elevated py-1 text-[13px] shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
          <p className="px-3 py-1.5 text-[12px] text-fg-3">Mover a otro hilo</p>
          <button
            type="button"
            onClick={() => void move(null)}
            className="block w-full truncate px-3 py-1.5 text-left text-danger transition-colors hover:bg-white/8"
          >
            Quitar de esta discusión
          </button>
          {candidates.length ? (
            candidates.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => void move(thread.id)}
                className="block w-full truncate px-3 py-1.5 text-left text-fg transition-colors hover:bg-white/8"
              >
                {thread.title}
              </button>
            ))
          ) : (
            <p className="px-3 py-1.5 text-fg-3">No hay otros hilos en este grupo.</p>
          )}
        </div>
      ) : null}
    </span>
  );
}
