"use client";

import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/sidebar";
import { Deck } from "@/components/deck";
import { api } from "@/lib/api";
import { startLiveSync } from "@/lib/live";
import { useDeckStore } from "@/lib/store";

export default function Home() {
  const group = useDeckStore((state) => state.group);
  const loaded = useDeckStore((state) => state.loaded);
  const setGroup = useDeckStore((state) => state.setGroup);
  const setGroups = useDeckStore((state) => state.setGroups);
  const setDiscussions = useDeckStore((state) => state.setDiscussions);
  const setNotifications = useDeckStore((state) => state.setNotifications);
  const groupIdRef = useRef<string | null>(null);

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
    </div>
  );
}
