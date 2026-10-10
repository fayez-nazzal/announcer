// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BrowserDoubles, settle, stubBrowser } from "./test-doubles.ts";
import { type UseListener, useListener } from "./use-listener.ts";

const ANNOUNCEMENT = JSON.stringify({ topic: "desk", message: "build finished" });

let browser: BrowserDoubles;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

function suspendAudio() {
  const context = browser.contexts[0];
  if (context === undefined) {
    throw new Error("No audio context was created");
  }
  context.state = "suspended";
}

async function startListening(result: { current: UseListener }) {
  act(() => result.current.start());
  await act(() => settle());
  act(() => browser.sockets[0]?.open());
}

beforeEach(() => {
  vi.useFakeTimers();
  browser = stubBrowser();
  setVisibility("visible");
});

afterEach(() => {
  Reflect.deleteProperty(document, "visibilityState");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useListener", () => {
  it("defaults to all topics and connects with the chosen topic", async () => {
    const { result } = renderHook(() => useListener());
    expect(result.current.topic).toBe("*");

    act(() => result.current.setTopic("desk"));
    await startListening(result);

    expect(new URL(browser.sockets[0]?.url ?? "").searchParams.get("topic")).toBe("desk");
    expect(result.current.status).toBe("listening");
  });

  it("exposes the latest announcement from the socket", async () => {
    const { result } = renderHook(() => useListener());
    await startListening(result);

    act(() => browser.sockets[0]?.receive(ANNOUNCEMENT));

    expect(result.current.lastAnnouncement).toEqual({ topic: "desk", message: "build finished" });
    expect(browser.contexts[0]?.sources).toHaveLength(1);
  });

  it("unmount closes the socket and disposes the audio context", async () => {
    const { result, unmount } = renderHook(() => useListener());
    await startListening(result);

    unmount();

    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(browser.contexts[0]?.closeCalls).toBe(1);
  });

  it("pagehide tears the session down", async () => {
    const { result } = renderHook(() => useListener());
    await startListening(result);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(result.current.status).toBe("idle");
    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(browser.contexts[0]?.closeCalls).toBe(1);
  });

  it("returning to a visible tab with suspended audio reports a playback error", async () => {
    const { result } = renderHook(() => useListener());
    await startListening(result);
    suspendAudio();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Sound playback is unavailable. Press Listen to retry.");
  });

  it("a hidden tab ignores visibility changes", async () => {
    const { result } = renderHook(() => useListener());
    await startListening(result);
    suspendAudio();
    setVisibility("hidden");

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.status).toBe("listening");
  });

  it("Strict Mode mount, unmount, and remount keeps a single socket once started", async () => {
    const strictWrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useListener(), { wrapper: strictWrapper });

    await startListening(result);

    expect(browser.sockets).toHaveLength(1);
    expect(result.current.status).toBe("listening");
  });
});
