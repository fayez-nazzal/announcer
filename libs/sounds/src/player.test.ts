import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCE_SOUND_URL } from "./asset.ts";
import { createNotificationPlayer, type NotificationPlayer } from "./player.ts";

const DECODED = { duration: 3.025 } as AudioBuffer;

class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: ((event: Event) => void) | null = null;
  connectedTo: AudioNode | undefined;
  started = false;
  stopped = false;
  disconnected = false;

  connect(destination: AudioNode) {
    this.connectedTo = destination;
  }

  disconnect() {
    this.disconnected = true;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
  }
}

class FakeAudioContext {
  state: AudioContextState = "suspended";
  readonly destination = {} as AudioDestinationNode;
  readonly sources: FakeSource[] = [];
  resumeCalls = 0;
  decodeCalls = 0;
  closeCalls = 0;
  resumeKeepsSuspended = false;
  decodeFails = false;

  resume() {
    this.resumeCalls++;
    if (!this.resumeKeepsSuspended) {
      this.state = "running";
    }
    return Promise.resolve();
  }

  close() {
    this.closeCalls++;
    this.state = "closed";
    return Promise.resolve();
  }

  decodeAudioData(_data: ArrayBuffer) {
    this.decodeCalls++;
    return this.decodeFails ? Promise.reject(new Error("bad audio")) : Promise.resolve(DECODED);
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

type FetchResponder = (signal: AbortSignal | undefined) => Promise<Response>;

let context: FakeAudioContext;
let contextsCreated: number;
let requests: string[];

function stubBrowserAudio(respond: FetchResponder = () => Promise.resolve(new Response(new ArrayBuffer(4)))) {
  vi.stubGlobal("AudioContext", function FakeAudioContextConstructor() {
    contextsCreated++;
    return context;
  });
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    requests.push(url);
    return respond(init?.signal ?? undefined);
  });
}

function abortableNever(signal: AbortSignal | undefined) {
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

function deferredResponse() {
  let release: (response: Response) => void = () => {};
  const respond: FetchResponder = () =>
    new Promise<Response>((resolve) => {
      release = resolve;
    });
  return { respond, release: (response: Response) => release(response) };
}

async function preparedPlayer(): Promise<NotificationPlayer> {
  const player = createNotificationPlayer();
  await player.prepare();
  return player;
}

beforeEach(() => {
  context = new FakeAudioContext();
  contextsCreated = 0;
  requests = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createNotificationPlayer", () => {
  it("creates no audio context until the first prepare", async () => {
    stubBrowserAudio();
    const player = createNotificationPlayer();

    expect(contextsCreated).toBe(0);
    await player.prepare();
    expect(contextsCreated).toBe(1);
  });

  it("resumes the context synchronously and shares one in-flight load between callers", async () => {
    stubBrowserAudio();
    const player = createNotificationPlayer();

    const first = player.prepare();
    const second = player.prepare();

    expect(context.resumeCalls).toBe(1);
    await Promise.all([first, second]);
    expect(requests).toEqual([ANNOUNCE_SOUND_URL]);
    expect(context.decodeCalls).toBe(1);
    expect(context.resumeCalls).toBe(1);
  });

  it("rejects preparation when the context stays suspended after resume", async () => {
    stubBrowserAudio();
    context.resumeKeepsSuspended = true;
    const player = createNotificationPlayer();

    await expect(player.prepare()).rejects.toThrow("Audio context is not running");
    expect(player.ready).toBe(false);
  });

  it("rejects preparation when Web Audio is unavailable", async () => {
    stubBrowserAudio();
    vi.stubGlobal("AudioContext", undefined);
    const player = createNotificationPlayer();

    await expect(player.prepare()).rejects.toThrow();
  });

  it("rejects a non-2xx sound response and retries on a later prepare", async () => {
    let attempts = 0;
    stubBrowserAudio(() => {
      attempts++;
      return Promise.resolve(new Response(new ArrayBuffer(4), { status: attempts === 1 ? 503 : 200 }));
    });
    const player = createNotificationPlayer();

    await expect(player.prepare()).rejects.toThrow("Sound failed to load: 503");
    await expect(player.prepare()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(player.ready).toBe(true);
  });

  it("rejects preparation when decoding fails and retries on a later prepare", async () => {
    stubBrowserAudio();
    context.decodeFails = true;
    const player = createNotificationPlayer();

    await expect(player.prepare()).rejects.toThrow("bad audio");
    context.decodeFails = false;
    await expect(player.prepare()).resolves.toBeUndefined();
    expect(context.decodeCalls).toBe(2);
  });

  it("is ready only after decoding while the context is running, and reflects later suspension", async () => {
    stubBrowserAudio();
    const player = createNotificationPlayer();

    expect(player.ready).toBe(false);
    await player.prepare();
    expect(player.ready).toBe(true);
    context.state = "suspended";
    expect(player.ready).toBe(false);
  });

  it("refuses to play before a buffer is prepared", () => {
    stubBrowserAudio();
    const player = createNotificationPlayer();

    expect(() => player.play()).toThrow("Sound is not ready to play");
    expect(context.sources).toHaveLength(0);
  });

  it("starts a fresh source for every play with the decoded buffer", async () => {
    stubBrowserAudio();
    const player = await preparedPlayer();

    player.play();
    player.play();

    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]).not.toBe(context.sources[1]);
    for (const source of context.sources) {
      expect(source.buffer).toBe(DECODED);
      expect(source.connectedTo).toBe(context.destination);
      expect(source.started).toBe(true);
    }
  });

  it("stops every active source but keeps the buffer for the next play", async () => {
    stubBrowserAudio();
    const player = await preparedPlayer();
    player.play();
    player.play();

    player.stop();

    for (const source of context.sources) {
      expect(source.stopped).toBe(true);
      expect(source.disconnected).toBe(true);
    }
    expect(player.ready).toBe(true);
    player.play();
    expect(context.sources).toHaveLength(3);
    expect(requests).toHaveLength(1);
  });

  it("disconnects naturally ended sources so a later stop does not touch them", async () => {
    stubBrowserAudio();
    const player = await preparedPlayer();
    player.play();
    const [ended] = context.sources;

    ended?.onended?.(new Event("ended"));
    player.stop();

    expect(ended?.disconnected).toBe(true);
    expect(ended?.stopped).toBe(false);
  });

  it("aborts a pending load on dispose, rejecting the preparation", async () => {
    stubBrowserAudio(abortableNever);
    const player = createNotificationPlayer();

    const pending = player.prepare();
    await player.dispose();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(player.ready).toBe(false);
  });

  it("discards a load that completes after dispose instead of marking the buffer ready", async () => {
    const deferred = deferredResponse();
    stubBrowserAudio(deferred.respond);
    const player = createNotificationPlayer();

    const pending = player.prepare();
    await player.dispose();
    deferred.release(new Response(new ArrayBuffer(4)));

    await expect(pending).rejects.toThrow("Sound player is disposed");
    expect(player.ready).toBe(false);
  });

  it("stops sources, closes the context once, and refuses later prepare and play", async () => {
    stubBrowserAudio();
    const player = await preparedPlayer();
    player.play();

    await player.dispose();
    await player.dispose();

    expect(context.sources[0]?.stopped).toBe(true);
    expect(context.closeCalls).toBe(1);
    expect(player.ready).toBe(false);
    await expect(player.prepare()).rejects.toThrow("Sound player is disposed");
    expect(() => player.play()).toThrow("Sound is not ready to play");
  });
});
