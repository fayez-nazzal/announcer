import { serveStatic, upgradeWebSocket, websocket } from "@hono/bun";
import type { MiddlewareHandler } from "hono";
import { createApp } from "./app.ts";
import { InMemoryAnnouncementDelivery } from "./delivery.ts";

const CLIENT_ROOT = "./dist/apps/web/client";
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

const delivery = new InMemoryAnnouncementDelivery();
const app = createApp(delivery, upgradeWebSocket);

const cacheImmutableAssets: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.res.status === 200) {
    c.res.headers.set("Cache-Control", IMMUTABLE_CACHE);
  }
};

const noCacheHtml: MiddlewareHandler = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-cache");
};

const indexHtml = serveStatic({ path: `${CLIENT_ROOT}/index.html` });

app.use("/assets/*", cacheImmutableAssets);
app.use("/assets/*", serveStatic({ root: CLIENT_ROOT }));
app.get("/listen", noCacheHtml, indexHtml);
app.get("/announce", noCacheHtml, indexHtml);
app.get("/", (c) => c.redirect("/listen", 302));

export default {
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket,
};
