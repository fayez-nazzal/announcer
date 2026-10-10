// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListenerController } from "./listener-controller.ts";
import { type BrowserDoubles, type FakeAudioContext, settle, stubBrowser } from "./test-doubles.ts";

const ANNOUNCEMENT = JSON.stringify({ topic: "work", message: "deploy done" });
const PLAYBACK_UNAVAILABLE = "Sound playback is unavailable. Press Listen to retry.";
const INVALID = "Invalid announcement received. Press Listen to retry.";
const UNABLE_TO_ENABLE = "Unable to enable sound. Press Listen to retry.";

let browser: BrowserDoubles;
let controller: ListenerController;

// Starts a session and opens the first socket.
async function listen(topic = "work") {
  controller.start(topic);
  await settle();
  browser.sockets[0]?.open();
}

function currentContext(): FakeAudioContext {
  const context = browser.contexts[0];
  if (context === undefined) {
    throw new Error("No audio context was created");
  }
  return context;
}

function suspendAudio() {
  currentContext().state = "suspended";
}

beforeEach(() => {
  vi.useFakeTimers();
  browser = stubBrowser();
  controller = new ListenerController();
});

afterEach(() => {
  controller.teardown();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ListenerController start and stop", () => {
  it("stays idle and creates no audio context until Listen", () => {
    expect(controller.getSnapshot().status).toBe("idle");
    expect(browser.contexts).toHaveLength(0);
    expect(browser.sockets).toHaveLength(0);
  });

  it("unlocks sound synchronously and connects with the topic once preparation resolves", async () => {
    controller.start("work");

    expect(browser.contexts).toHaveLength(1);
    expect(controller.getSnapshot().status).toBe("starting");
    expect(browser.sockets).toHaveLength(0);

    await settle();

    expect(browser.sockets).toHaveLength(1);
    const url = new URL(browser.sockets[0]?.url ?? "");
    expect(url.protocol).toBe("ws:");
    expect(url.pathname).toBe("/api/v1/listen");
    expect(url.searchParams.get("topic")).toBe("work");
  });

  it("subscribes to all topics when the topic is blank", async () => {
    await listen("");

    expect(new URL(browser.sockets[0]?.url ?? "").searchParams.get("topic")).toBe("*");
  });

  it("reports listening only after the socket opens and sends the first ping", async () => {
    await listen();

    expect(controller.getSnapshot().status).toBe("listening");
    expect(browser.sockets[0]?.sent).toEqual(["ping"]);
  });

  it("stop during preparation prevents the connection", async () => {
    controller.start("work");
    controller.stop();
    await settle();

    expect(browser.sockets).toHaveLength(0);
    expect(controller.getSnapshot().status).toBe("idle");
  });

  it("stop closes an open socket and stops active sounds", async () => {
    await listen();
    browser.sockets[0]?.receive(ANNOUNCEMENT);
    const source = browser.contexts[0]?.sources[0];

    controller.stop();

    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(source?.stopped).toBe(true);
    expect(controller.getSnapshot().status).toBe("idle");
  });

  it("stop during reconnecting cancels the timer and ignores late socket callbacks", async () => {
    await listen();
    browser.sockets[0]?.drop();
    controller.stop();

    vi.advanceTimersByTime(60_000);
    browser.sockets[0]?.receive(ANNOUNCEMENT);

    expect(browser.sockets).toHaveLength(1);
    expect(browser.contexts[0]?.sources).toHaveLength(0);
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", lastAnnouncement: null });
  });

  it("starting again replaces the open socket", async () => {
    await listen("work");
    controller.start("other");
    await settle();

    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(new URL(browser.sockets[1]?.url ?? "").searchParams.get("topic")).toBe("other");
  });

  it("notifies subscribers until they unsubscribe", () => {
    const subscriber = vi.fn();
    const unsubscribe = controller.subscribe(subscriber);

    controller.start("work");
    expect(subscriber).toHaveBeenCalled();

    const callsBeforeUnsubscribe = subscriber.mock.calls.length;
    unsubscribe();
    controller.stop();
    expect(subscriber.mock.calls.length).toBe(callsBeforeUnsubscribe);
  });
});

describe("ListenerController heartbeat and reconnect", () => {
  it("pings every 30 seconds and keeps the session while pongs arrive", async () => {
    await listen();

    vi.advanceTimersByTime(30_000);
    browser.sockets[0]?.receive("pong");
    vi.advanceTimersByTime(60_000);
    browser.sockets[0]?.receive("pong");
    vi.advanceTimersByTime(30_000);

    expect(browser.sockets).toHaveLength(1);
    expect(browser.sockets[0]?.closeCalls).toBe(0);
    expect(browser.sockets[0]?.sent).toEqual(["ping", "ping", "ping", "ping", "ping"]);
    expect(controller.getSnapshot().status).toBe("listening");
  });

  it("drops a socket with no pong for 90 seconds and reconnects after one second", async () => {
    await listen();

    vi.advanceTimersByTime(90_000);

    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(controller.getSnapshot().status).toBe("reconnecting");
    expect(browser.sockets).toHaveLength(1);

    vi.advanceTimersByTime(1_000);
    expect(browser.sockets).toHaveLength(2);
  });

  it("reconnects with capped backoff of 1, 2, 4, 8, 16, then 30 seconds", async () => {
    await listen();
    browser.sockets[0]?.drop();

    const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const [index, delay] of delays.entries()) {
      vi.advanceTimersByTime(delay - 1);
      expect(browser.sockets).toHaveLength(index + 1);
      vi.advanceTimersByTime(1);
      expect(browser.sockets).toHaveLength(index + 2);
      browser.sockets[index + 1]?.drop();
    }
  });

  it("resets backoff after a successful reopen", async () => {
    await listen();
    browser.sockets[0]?.drop();
    vi.advanceTimersByTime(1_000);
    browser.sockets[1]?.open();
    browser.sockets[1]?.drop();

    vi.advanceTimersByTime(999);
    expect(browser.sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(browser.sockets).toHaveLength(3);
  });

  it("a socket that closes before opening also schedules a reconnect", async () => {
    controller.start("work");
    await settle();
    browser.sockets[0]?.drop();

    expect(controller.getSnapshot().status).toBe("reconnecting");
    vi.advanceTimersByTime(1_000);
    expect(browser.sockets).toHaveLength(2);
  });

  it("a stale close event after a drop does not schedule a second reconnect", async () => {
    await listen();
    vi.advanceTimersByTime(90_000);
    browser.sockets[0]?.drop();

    vi.advanceTimersByTime(1_000);
    expect(browser.sockets).toHaveLength(2);
  });
});

describe("ListenerController announcements", () => {
  it("plays each valid announcement once and records the latest", async () => {
    await listen();

    browser.sockets[0]?.receive("pong");
    expect(browser.contexts[0]?.sources).toHaveLength(0);

    browser.sockets[0]?.receive(ANNOUNCEMENT);

    expect(browser.contexts[0]?.sources).toHaveLength(1);
    expect(browser.contexts[0]?.sources[0]?.started).toBe(true);
    expect(controller.getSnapshot().lastAnnouncement).toEqual({ topic: "work", message: "deploy done" });
  });

  it("treats an empty message as a sound-only announcement", async () => {
    await listen("*");

    browser.sockets[0]?.receive(JSON.stringify({ topic: "*", message: "" }));

    expect(browser.contexts[0]?.sources).toHaveLength(1);
    expect(controller.getSnapshot().lastAnnouncement).toEqual({ topic: "*", message: "" });
  });

  it.each([
    ["not JSON", "not json"],
    ["binary data", new ArrayBuffer(2)],
    ["missing message", JSON.stringify({ topic: "work" })],
    ["non-string topic", JSON.stringify({ topic: 1, message: "x" })],
  ])("stops with a visible error for a frame with %s", async (_label, frame) => {
    await listen();

    browser.sockets[0]?.receive(frame);

    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: INVALID });
    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(browser.contexts[0]?.sources).toHaveLength(0);

    vi.advanceTimersByTime(60_000);
    expect(browser.sockets).toHaveLength(1);
  });

  it("stops with a playback error when the audio context is suspended before a frame", async () => {
    await listen();
    suspendAudio();

    browser.sockets[0]?.receive(ANNOUNCEMENT);

    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: PLAYBACK_UNAVAILABLE });
    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(controller.getSnapshot().lastAnnouncement).toBeNull();
  });
});

describe("ListenerController failures", () => {
  it("reports a sound-enable error when preparation fails and retry connects", async () => {
    browser.fetch.mockResolvedValueOnce({ ok: false, status: 503 } as unknown as Response);

    controller.start("work");
    await settle();

    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: UNABLE_TO_ENABLE });
    expect(browser.sockets).toHaveLength(0);

    controller.start("work");
    await settle();

    expect(browser.sockets).toHaveLength(1);
  });

  it("reports playback unavailable when the socket opens with suspended audio", async () => {
    controller.start("work");
    await settle();
    suspendAudio();

    browser.sockets[0]?.open();

    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: PLAYBACK_UNAVAILABLE });
    expect(browser.sockets[0]?.closeCalls).toBe(1);
  });

  it("reconcile with suspended audio stops with a playback error", async () => {
    await listen();
    suspendAudio();

    controller.reconcile();

    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: PLAYBACK_UNAVAILABLE });
  });

  it("reconcile after a long hidden period drops the stale socket and reconnects", async () => {
    await listen();
    vi.setSystemTime(Date.now() + 90_000);

    controller.reconcile();

    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(controller.getSnapshot().status).toBe("reconnecting");
  });

  it("reconcile does nothing when not listening", () => {
    controller.reconcile();

    expect(controller.getSnapshot().status).toBe("idle");
    expect(browser.sockets).toHaveLength(0);
  });
});

describe("ListenerController teardown", () => {
  it("closes the socket, disposes the audio context, and lets a later Listen create a fresh one", async () => {
    await listen();

    controller.teardown();

    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(browser.contexts[0]?.closeCalls).toBe(1);
    expect(controller.getSnapshot().status).toBe("idle");

    controller.start("work");
    expect(browser.contexts).toHaveLength(2);
  });

  it("teardown during preparation prevents the connection", async () => {
    controller.start("work");
    controller.teardown();
    await settle();

    expect(browser.sockets).toHaveLength(0);
    expect(controller.getSnapshot().status).toBe("idle");
  });

  it("swallows a failed audio context close without an unhandled rejection", async () => {
    await listen();
    currentContext().closeFails = true;

    controller.teardown();
    await settle();

    expect(controller.getSnapshot().status).toBe("idle");
  });
});
