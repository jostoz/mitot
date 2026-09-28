import { api, type Notification } from "@/lib/api";
import { useDeckStore } from "@/lib/store";

/**
 * Mantiene el cliente consistente con el servidor aunque se pierdan eventos: al reconectar
 * el WebSocket, recuperar WhatsApp, volver a la pestaña o cada 20 s se trae el snapshot
 * completo de discusiones y notificaciones del grupo activo.
 */
export function startLiveSync(getGroupId: () => string | null) {
  const store = useDeckStore.getState;
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let debounceTimer: number | undefined;
  let attempt = 0;
  let stopped = false;
  let connectedOnce = false;
  let previousIngestState: string | undefined;
  let syncInFlight: Promise<void> | undefined;

  const synchronize = () => {
    if (syncInFlight) return syncInFlight;
    const groupId = getGroupId();
    if (!groupId) return Promise.resolve();

    syncInFlight = Promise.all([api.discussions(groupId), api.notifications(groupId)])
      .then(([discussions, notifications]) => {
        // El usuario pudo cambiar de grupo mientras la petición estaba en vuelo.
        if (getGroupId() !== groupId) return;
        store().setDiscussions(discussions);
        store().setNotifications(notifications);
      })
      .catch((error) => {
        console.error("Failed to synchronize deck state:", error);
      })
      .finally(() => {
        syncInFlight = undefined;
      });
    return syncInFlight;
  };

  const scheduleSynchronize = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void synchronize(), 500);
  };

  const connect = () => {
    const url = new URL("/api/events", window.location.origin);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);
    socket.onopen = () => {
      const recovered = connectedOnce;
      connectedOnce = true;
      attempt = 0;
      // Los eventos que llegaron mientras el socket estaba caído no se pueden reconstruir
      // individualmente; el snapshot es la fuente de verdad.
      if (recovered) void synchronize();
    };
    socket.onmessage = (event) => {
      const groupId = getGroupId();
      if (!groupId) return;
      const parsed = JSON.parse(event.data) as { type: string; notification?: Notification };
      if (parsed.type === "notification.created" && parsed.notification?.groupId === groupId) {
        store().addNotification(parsed.notification);
      }
      scheduleSynchronize();
    };
    socket.onclose = () => {
      if (stopped) return;
      attempt += 1;
      reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000));
    };
    socket.onerror = () => socket?.close();
  };

  const checkIngest = async () => {
    try {
      const status = await api.ingestStatus();
      const recovered = status.state === "open" && previousIngestState !== undefined && previousIngestState !== "open";
      previousIngestState = status.state;
      store().setIngestStatus(status);
      // Tras una desconexión de WhatsApp pueden haberse encolado o perdido eventos en el
      // cliente. Al volver a abrir, reconciliamos con Postgres.
      if (recovered) void synchronize();
    } catch {
      previousIngestState = "unreachable";
      store().setIngestStatus({ state: "unreachable", lastMessageAt: null });
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void synchronize();
  };

  connect();
  void checkIngest();
  const pollTimer = window.setInterval(() => void synchronize(), 20000);
  const ingestTimer = window.setInterval(() => void checkIngest(), 15000);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    stopped = true;
    socket?.close();
    window.clearTimeout(reconnectTimer);
    window.clearTimeout(debounceTimer);
    window.clearInterval(pollTimer);
    window.clearInterval(ingestTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
