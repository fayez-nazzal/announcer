import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { WSEvents } from "hono/ws";
import { announce, isAnnounceInput } from "@announce/messages";
import { normalizeTopic } from "@announce/topics";
import type { InMemoryAnnouncementDelivery } from "./delivery.ts";
import { createListenerEvents } from "./listen.ts";

export type UpgradeWebSocket = (
  createEvents: (c: Context) => WSEvents | Promise<WSEvents>,
) => MiddlewareHandler;

export function createApp(delivery: InMemoryAnnouncementDelivery, upgradeWebSocket: UpgradeWebSocket): Hono {
  const app = new Hono();

  app.post("/api/v1/announce", async (c) => {
    const mediaType = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      return c.json({ error: "Content-Type must be application/json" }, 415);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (!isAnnounceInput(body)) {
      return c.json({ error: "Expected a JSON object with only optional string topic and message" }, 400);
    }

    const result = announce(body, delivery);
    return c.json({ ok: true, listeners: result.listeners }, 200);
  });

  app.get(
    "/api/v1/listen",
    (c, next) => {
      if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
        return c.json({ error: "WebSocket upgrade required" }, 426);
      }
      return next();
    },
    upgradeWebSocket((c) => createListenerEvents(normalizeTopic(c.req.query("topic")), delivery)),
  );

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
