import { describe, expect, it } from "vitest";
import type { Hono } from "hono";
import { createApp, type UpgradeWebSocket } from "./app.ts";
import { InMemoryAnnouncementDelivery, type ListenerConnection } from "./delivery.ts";

// The real upgrader comes from @hono/bun in main.ts; these tests only exercise HTTP-level contract.
const unreachableUpgrade: UpgradeWebSocket = () => async () => new Response("unexpected upgrade");

function listener(delivery: InMemoryAnnouncementDelivery, topic: string) {
  const frames: string[] = [];
  const connection: ListenerConnection = {
    isOpen: () => true,
    send(frame) {
      frames.push(frame);
      return true;
    },
    close() {},
  };
  delivery.listen(topic, connection);
  return frames;
}

function setup() {
  const delivery = new InMemoryAnnouncementDelivery();
  return { delivery, app: createApp(delivery, unreachableUpgrade) };
}

function post(app: Hono, body: string, contentType = "application/json") {
  return app.request("/api/v1/announce", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("POST /api/v1/announce", () => {
  it("broadcasts an empty announcement to every listener", async () => {
    const { delivery, app } = setup();
    const work = listener(delivery, "work");
    const other = listener(delivery, "other");
    const wildcard = listener(delivery, "*");

    const response = await post(app, "{}");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, listeners: 3 });
    const expected = JSON.stringify({ topic: "*", message: "" });
    expect(work).toEqual([expected]);
    expect(other).toEqual([expected]);
    expect(wildcard).toEqual([expected]);
  });

  it("delivers a message-only announcement to every topic as the wildcard", async () => {
    const { delivery, app } = setup();
    const work = listener(delivery, "work");

    const response = await post(app, '{"message":"hello"}');

    expect(await response.json()).toEqual({ ok: true, listeners: 1 });
    expect(work).toEqual([JSON.stringify({ topic: "*", message: "hello" })]);
  });

  it("delivers a named topic only to matching listeners", async () => {
    const { delivery, app } = setup();
    const work = listener(delivery, "work");
    const other = listener(delivery, "other");
    const wildcard = listener(delivery, "*");

    const response = await post(app, '{"topic":"work","message":"desk"}');

    expect(await response.json()).toEqual({ ok: true, listeners: 2 });
    const expected = JSON.stringify({ topic: "work", message: "desk" });
    expect(work).toEqual([expected]);
    expect(wildcard).toEqual([expected]);
    expect(other).toEqual([]);
  });

  it("accepts an explicit wildcard topic for every listener", async () => {
    const { delivery, app } = setup();
    const work = listener(delivery, "work");

    const response = await post(app, '{"topic":"*","message":"all devices"}');

    expect(await response.json()).toEqual({ ok: true, listeners: 1 });
    expect(work).toEqual([JSON.stringify({ topic: "*", message: "all devices" })]);
  });

  it("reports zero listeners as a successful announcement", async () => {
    const { app } = setup();

    const response = await post(app, '{"message":"nobody"}');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, listeners: 0 });
  });

  it("accepts media type parameters and mixed case", async () => {
    const { app } = setup();

    const response = await post(app, "{}", "Application/JSON; charset=utf-8");

    expect(response.status).toBe(200);
  });

  it("rejects non-JSON content types without publishing", async () => {
    const { delivery, app } = setup();
    const wildcard = listener(delivery, "*");

    const response = await post(app, '{"message":"hi"}', "text/plain");

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Content-Type must be application/json" });
    expect(wildcard).toEqual([]);
  });

  it("rejects malformed JSON without publishing", async () => {
    const { delivery, app } = setup();
    const wildcard = listener(delivery, "*");

    const response = await post(app, "{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
    expect(wildcard).toEqual([]);
  });

  it.each(['{"message":"hello","extra":true}', "null", '["hello"]', '{"message":null}'])(
    "rejects invalid announcement body %s without publishing",
    async (body) => {
      const { delivery, app } = setup();
      const wildcard = listener(delivery, "*");

      const response = await post(app, body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Expected a JSON object with only optional string topic and message",
      });
      expect(wildcard).toEqual([]);
    },
  );
});

describe("unmatched routes", () => {
  it("returns JSON 404 for unknown API paths", async () => {
    const { app } = setup();

    const response = await app.request("/api/v1/missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("returns JSON 404 for an unsupported method on the announce route", async () => {
    const { app } = setup();

    const response = await app.request("/api/v1/announce");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("requires a WebSocket upgrade for the listen route", async () => {
    const { app } = setup();

    const response = await app.request("/api/v1/listen?topic=work");

    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({ error: "WebSocket upgrade required" });
  });
});
