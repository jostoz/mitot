"use client";

import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/sidebar";
import { Deck } from "@/components/deck";
import { api } from "@/lib/api";
import { startLiveSync } from "@/lib/live";
import { playNotificationSound, unlockNotificationSound } from "@/lib/notification-sound";
import { useDeckStore } from "@/lib/store";

export default function Home() {
  const group = useDeckStore((state) => state.group);
  const loaded = useDeckStore((state) => state.loaded);
  const setGroup = useDeckStore((state) => state.setGroup);
  const setGroups = useDeckStore((state) => state.setGroups);
  const setDiscussions = useDeckStore((state) => state.setDiscussions);
  const setNotifications = useDeckStore((state) => state.setNotifications);
  const notificationPopouts = useDeckStore((state) => state.notificationPopouts);
  const dismissNotificationPopout = useDeckStore((state) => state.dismissNotificationPopout);
  const groupIdRef = useRef<string | null>(null);
  const soundedPopoutIds = useRef(new Set<string>());

  useEffect(() => {
    void (async () => {
      const groups = await api.groups();
      setGroups(groups);
      const first = groups[0];
      if (!first) return;
      setGroup(first);
    })();
    return startLiveSync(() => groupIdRef.current);
  }, [setGroup, setGroups]);

  useEffect(() => {
    if (!group) return;
    groupIdRef.current = group.id;
    void (async () => {
      const [discussions, notifications] = await Promise.all([api.discussions(group.id), api.notifications(group.id)]);
      setDiscussions(discussions);
      setNotifications(notifications);
    })();
  }, [group, setDiscussions, setNotifications]);

  useEffect(() => {
    const timers = notificationPopouts.map((notification) =>
      window.setTimeout(() => dismissNotificationPopout(notification.id), 8000),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [dismissNotificationPopout, notificationPopouts]);

  useEffect(() => {
    const unlock = () => void unlockNotificationSound();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    for (const notification of notificationPopouts) {
      if (soundedPopoutIds.current.has(notification.id)) continue;
      soundedPopoutIds.current.add(notification.id);
      void playNotificationSound();
    }
  }, [notificationPopouts]);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <Sidebar />
      <main className="relative min-w-0 flex-1">
        {loaded ? (
          <Deck />
        ) : (
          <p className="grid h-full place-items-center text-[14px] text-fg-3">
            {group ? `Cargando ${group.name}…` : "Conectando con el deck…"}
          </p>
        )}
      </main>

      <div aria-live="polite" aria-label="Notificaciones nuevas" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {notificationPopouts.map((notification) => (
          <article key={notification.id} className="pointer-events-auto rounded-[14px] border border-line bg-elevated px-4 py-3 shadow-[0_16px_42px_rgba(0,0,0,0.6)]">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-accent">{notification.type.replaceAll("_", " ")}</p>
                <p className="mt-0.5 text-[14px] font-semibold text-fg">{notification.title}</p>
                {notification.body ? <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-fg-2">{notification.body}</p> : null}
              </div>
              <button
                type="button"
                aria-label={`Cerrar notificación: ${notification.title}`}
                onClick={() => dismissNotificationPopout(notification.id)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-fg-3 transition-colors hover:bg-white/8 hover:text-fg"
              >
                ×
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
