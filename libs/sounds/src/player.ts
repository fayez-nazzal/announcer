import { ANNOUNCE_SOUND_URL } from "./asset.ts";

export interface NotificationPlayer {
  readonly ready: boolean;
  prepare(): Promise<void>;
  play(): void;
  stop(): void;
  dispose(): Promise<void>;
}

class WebAudioNotificationPlayer implements NotificationPlayer {
  readonly #active = new Set<AudioBufferSourceNode>();
  #context: AudioContext | undefined;
  #buffer: AudioBuffer | undefined;
  #loading: Promise<AudioBuffer> | undefined;
  readonly #abort = new AbortController();
  #disposed = false;

  get ready(): boolean {
    return !this.#disposed && this.#buffer !== undefined && this.#context?.state === "running";
  }

  // Context creation and resume() happen synchronously, before the first await, so a Listen click unlocks audio.
  async prepare(): Promise<void> {
    if (this.#disposed) {
      throw new Error("Sound player is disposed");
    }
    const context = (this.#context ??= new AudioContext());
    const unlocking = context.state === "running" ? undefined : context.resume();
    await Promise.all([this.#loadBuffer(context), unlocking]);
    if (this.#disposed) {
      throw new Error("Sound player is disposed");
    }
    if (context.state !== "running") {
      throw new Error("Audio context is not running");
    }
  }

  play(): void {
    const context = this.#context;
    const buffer = this.#buffer;
    if (!this.ready || context === undefined || buffer === undefined) {
      throw new Error("Sound is not ready to play");
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      this.#active.delete(source);
      source.disconnect();
    };
    this.#active.add(source);
    source.start();
  }

  stop(): void {
    for (const source of this.#active) {
      source.stop();
      source.disconnect();
    }
    this.#active.clear();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#abort.abort();
    this.stop();
    await this.#context?.close();
  }

  #loadBuffer(context: AudioContext): Promise<AudioBuffer> {
    this.#loading ??= this.#load(context).catch((error: unknown) => {
      this.#loading = undefined;
      throw error;
    });
    return this.#loading;
  }

  async #load(context: AudioContext): Promise<AudioBuffer> {
    const response = await fetch(ANNOUNCE_SOUND_URL, { signal: this.#abort.signal });
    if (!response.ok) {
      throw new Error(`Sound failed to load: ${response.status}`);
    }
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    this.#buffer = buffer;
    return buffer;
  }
}

export function createNotificationPlayer(): NotificationPlayer {
  return new WebAudioNotificationPlayer();
}
