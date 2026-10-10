import { vi, type Mock } from "vitest";

export class FakeSocket {
  readonly url: string;
  readonly sent: string[] = [];
  closeCalls = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closeCalls++;
  }

  open() {
    this.onopen?.();
  }

  receive(data: unknown) {
    this.onmessage?.({ data });
  }

  drop() {
    this.onclose?.();
  }
}

export class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  disconnected = false;

  connect() {}

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

export class FakeAudioContext {
  state: AudioContextState = "suspended";
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  closeCalls = 0;
  closeFails = false;

  resume() {
    this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.closeCalls++;
    this.state = "closed";
    return this.closeFails ? Promise.reject(new Error("close failed")) : Promise.resolve();
  }

  decodeAudioData(_data: ArrayBuffer) {
    return Promise.resolve({ duration: 3.025 });
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

export interface BrowserDoubles {
  readonly sockets: FakeSocket[];
  readonly contexts: FakeAudioContext[];
  readonly fetch: Mock<typeof fetch>;
}

const SOUND_RESPONSE = { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) };

// Stubs WebSocket, AudioContext, and fetch. Announce POSTs answer with zero listeners unless a test overrides fetch.
export function stubBrowser(): BrowserDoubles {
  const sockets: FakeSocket[] = [];
  const contexts: FakeAudioContext[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === "POST") {
      return Response.json({ ok: true, listeners: 0 });
    }
    return SOUND_RESPONSE as unknown as Response;
  });

  vi.stubGlobal(
    "WebSocket",
    function FakeWebSocketConstructor(url: string) {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  );
  vi.stubGlobal(
    "AudioContext",
    function FakeAudioContextConstructor() {
      const context = new FakeAudioContext();
      contexts.push(context);
      return context;
    },
  );
  vi.stubGlobal("fetch", fetchMock);

  return { sockets, contexts, fetch: fetchMock };
}

// Lets pending promise chains (sound preparation) settle under fake or real timers.
export async function settle(): Promise<void> {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
}
