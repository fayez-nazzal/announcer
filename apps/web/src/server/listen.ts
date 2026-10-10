import type { ServerWebSocket } from "bun";
import type { WSEvents } from "hono/ws";
import type { Topic } from "@announce/topics";
import type { InMemoryAnnouncementDelivery, ListenerConnection } from "./delivery.ts";

export function createListenerEvents(topic: Topic, delivery: InMemoryAnnouncementDelivery): WSEvents {
  let connection: ListenerConnection | undefined;
  let unlisten: (() => void) | undefined;

  const fail = (code: number, reason: string): void => {
    unlisten?.();
    unlisten = undefined;
    try {
      connection?.close(code, reason);
    } catch {
      // Closing an already-dead socket is best effort.
    }
  };

  return {
    onOpen(_event, ws) {
      const socket = ws.raw as ServerWebSocket<undefined>;
      connection = {
        isOpen: () => socket.readyState === 1,
        send: (frame) => socket.send(frame) !== 0,
        close: (code, reason) => socket.close(code, reason),
      };
      unlisten = delivery.listen(topic, connection);
    },
    onMessage(event) {
      if (event.data !== "ping") {
        fail(1008, "Unsupported listener message");
        return;
      }
      if (!connection?.send("pong")) {
        fail(1011, "Delivery failed");
      }
    },
    onClose() {
      unlisten?.();
      unlisten = undefined;
    },
  };
}
