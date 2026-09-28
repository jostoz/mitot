import { api, type Notification } from "@/lib/api";
import { useDeckStore } from "@/lib/store";

/** Abre el WebSocket /events con reconexión exponencial, polling de respaldo y recarga con debounce. */
export function startLiveSync(getGroupId: () => string | null) {
  const store = useDeckStore.getState;
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let debounceTimer: number | undefined;
  let attempt = 0;
  let stopped = false;

  const reloadDiscussions = async () => {
    const groupId = getGroupId();
    if (!groupId) return;
    store().setDiscussions(await api.discussions(groupId));
  };

  const connect = () => {
    const url = new URL("/api/events", window.location.origin);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempt = 0;
    };
    socket.onmessage = (event) => {
      if (!getGroupId()) return;
      const parsed = JSON.parse(event.data) as { type: string; notification?: Notification };
      if (parsed.type === "notification.created" && parsed.notification) store().addNotification(parsed.notification);
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void reloadDiscussions(), 500);
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
      store().setIngestStatus(await api.ingestStatus());
    } catch {
      store().setIngestStatus({ state: "unreachable", lastMessageAt: null });
    }
  };

  connect();
  void checkIngest();
  const pollTimer = window.setInterval(() => void reloadDiscussions(), 20000);
  const ingestTimer = window.setInterval(() => void checkIngest(), 15000);

  return () => {
    stopped = true;
    socket?.close();
    window.clearTimeout(reconnectTimer);
    window.clearTimeout(debounceTimer);
    window.clearInterval(pollTimer);
    window.clearInterval(ingestTimer);
  };
}
