import { isAnnounceInput, type Announcement } from "@announce/messages";
import { createNotificationPlayer, type NotificationPlayer } from "@announce/sounds";
import { normalizeTopic } from "@announce/topics";

export type ListenerStatus = "idle" | "starting" | "listening" | "reconnecting" | "error";

export interface ListenerState {
  readonly status: ListenerStatus;
  readonly error: string | null;
  readonly lastAnnouncement: Announcement | null;
}

const HEARTBEAT_MS = 30_000;
const STALE_AFTER_MS = 90_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
const RECONNECT_CAP_MS = 30_000;

const UNABLE_TO_ENABLE_SOUND = "Unable to enable sound. Press Listen to retry.";
const PLAYBACK_UNAVAILABLE = "Sound playback is unavailable. Press Listen to retry.";
const INVALID_ANNOUNCEMENT = "Invalid announcement received. Press Listen to retry.";

export class ListenerController {
  #state: ListenerState = { status: "idle", error: null, lastAnnouncement: null };
  readonly #subscribers = new Set<() => void>();
  #player: NotificationPlayer | undefined;
  #topic = "*";
  #generation = 0;
  #socket: WebSocket | undefined;
  #heartbeatTimer: number | undefined;
  #reconnectTimer: number | undefined;
  #reconnectAttempt = 0;
  #lastPongAt = 0;

  readonly subscribe = (subscriber: () => void): (() => void) => {
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  };

  readonly getSnapshot = (): ListenerState => this.#state;

  // Sound is prepared synchronously from the Listen click; the socket opens only after preparation resolves.
  readonly start = (topic: string): void => {
    this.#cancel();
    this.#topic = topic;
    this.#reconnectAttempt = 0;
    const generation = this.#generation;
    const player = (this.#player ??= createNotificationPlayer());
    this.#update({ status: "starting", error: null });
    void player.prepare().then(
      () => {
        if (generation === this.#generation) {
          this.#connect();
        }
      },
      () => {
        if (generation === this.#generation) {
          this.#fail(UNABLE_TO_ENABLE_SOUND);
        }
      },
    );
  };

  readonly stop = (): void => {
    this.#cancel();
    this.#update({ status: "idle", error: null });
  };

  // Used for unmount and pagehide: cancels the session and releases the audio context.
  readonly teardown = (): void => {
    this.#cancel();
    const player = this.#player;
    this.#player = undefined;
    void player?.dispose().catch(() => undefined);
    this.#update({ status: "idle", error: null });
  };

  // Called when the page becomes visible again: timers may have been throttled while hidden.
  readonly reconcile = (): void => {
    const socket = this.#socket;
    if (this.#state.status !== "listening" || socket === undefined) {
      return;
    }
    if (this.#player?.ready !== true) {
      this.#fail(PLAYBACK_UNAVAILABLE);
      return;
    }
    if (this.#isStale()) {
      this.#dropSocket(socket);
    }
  };

  #connect(): void {
    const socket = new WebSocket(listenUrl(this.#topic));
    this.#socket = socket;
    socket.onopen = () => {
      if (this.#isCurrent(socket)) {
        this.#onOpen(socket);
      }
    };
    socket.onmessage = (event: MessageEvent) => {
      if (this.#isCurrent(socket)) {
        this.#onMessage(event.data);
      }
    };
    socket.onclose = () => {
      if (this.#isCurrent(socket)) {
        this.#socket = undefined;
        this.#handleLoss();
      }
    };
  }

  #onOpen(socket: WebSocket): void {
    if (this.#player?.ready !== true) {
      this.#fail(PLAYBACK_UNAVAILABLE);
      return;
    }
    this.#reconnectAttempt = 0;
    this.#lastPongAt = Date.now();
    this.#update({ status: "listening", error: null });
    socket.send("ping");
    this.#heartbeatTimer = setInterval(() => {
      this.#beat(socket);
    }, HEARTBEAT_MS);
  }

  #onMessage(data: unknown): void {
    if (data === "pong") {
      this.#lastPongAt = Date.now();
      return;
    }
    const announcement = parseAnnouncement(data);
    if (announcement === undefined) {
      this.#fail(INVALID_ANNOUNCEMENT);
      return;
    }
    try {
      this.#player?.play();
    } catch {
      this.#fail(PLAYBACK_UNAVAILABLE);
      return;
    }
    this.#update({ lastAnnouncement: announcement });
  }

  #beat(socket: WebSocket): void {
    if (this.#isStale()) {
      this.#dropSocket(socket);
      return;
    }
    socket.send("ping");
  }

  #dropSocket(socket: WebSocket): void {
    this.#socket = undefined;
    socket.close();
    this.#handleLoss();
  }

  #handleLoss(): void {
    this.#clearHeartbeat();
    this.#update({ status: "reconnecting", error: null });
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[this.#reconnectAttempt] ?? RECONNECT_CAP_MS;
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      this.#connect();
    }, delay);
  }

  #fail(message: string): void {
    this.#cancel();
    this.#update({ status: "error", error: message });
  }

  #cancel(): void {
    this.#generation += 1;
    this.#clearHeartbeat();
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close();
    this.#player?.stop();
  }

  #clearHeartbeat(): void {
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = undefined;
  }

  #isCurrent(socket: WebSocket): boolean {
    return socket === this.#socket;
  }

  #isStale(): boolean {
    return Date.now() - this.#lastPongAt >= STALE_AFTER_MS;
  }

  #update(patch: Partial<ListenerState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const subscriber of this.#subscribers) {
      subscriber();
    }
  }
}

function listenUrl(topic: string): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const query = new URLSearchParams({ topic: normalizeTopic(topic) });
  return `${scheme}//${location.host}/api/v1/listen?${query.toString()}`;
}

function parseAnnouncement(data: unknown): Announcement | undefined {
  if (typeof data !== "string") {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!isAnnounceInput(value) || typeof value.topic !== "string" || typeof value.message !== "string") {
    return undefined;
  }
  return { topic: value.topic, message: value.message };
}
