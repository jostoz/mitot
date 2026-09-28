import type { Discussion } from "@/lib/api";

export const OFF_TOPIC_KEY = "off-topic";

/** El bucket técnico de ruido conserva mensajes para trazabilidad, pero no es una discusión del deck. */
export function isVisibleDiscussion(discussion: Discussion) {
  return discussion.topicKey !== OFF_TOPIC_KEY;
}
