import { matchesTopic, type Topic } from "@announce/topics";
import type { Announcement, AnnouncementDelivery } from "@announce/messages";

export interface ListenerConnection {
  isOpen(): boolean;
  send(frame: string): boolean;
  close(code: number, reason: string): void;
}

export class InMemoryAnnouncementDelivery implements AnnouncementDelivery {
  readonly #listeners = new Map<ListenerConnection, Topic>();

  listen(topic: Topic, connection: ListenerConnection): () => void {
    this.#listeners.set(connection, topic);
    return () => {
      this.#listeners.delete(connection);
    };
  }

  publish(announcement: Announcement): number {
    let frame: string | undefined;
    let delivered = 0;

    for (const [connection, listenerTopic] of this.#listeners) {
      if (!connection.isOpen()) {
        this.#listeners.delete(connection);
        continue;
      }
      if (!matchesTopic(announcement.topic, listenerTopic)) {
        continue;
      }

      frame ??= JSON.stringify(announcement);
      if (this.#deliver(connection, frame)) {
        delivered += 1;
      }
    }

    return delivered;
  }

  #deliver(connection: ListenerConnection, frame: string): boolean {
    let sent = false;
    try {
      sent = connection.send(frame);
    } catch {
      sent = false;
    }
    if (sent) {
      return true;
    }

    this.#listeners.delete(connection);
    try {
      connection.close(1011, "Delivery failed");
    } catch {
      // The connection is already unusable; other listeners must still receive the announcement.
    }
    return false;
  }
}
