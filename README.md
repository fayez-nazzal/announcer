# 📣 Announcer

Send a message from one device and have every listening device play a sound and show it, live.

- **Announce** a message, optionally tagged with a topic.
- **Listen** on all topics, or on a single topic.
- Real-time delivery over WebSockets.

## Quick start

Requirements: [Bun](https://bun.sh) 1.4.2 (see `.bun-version`).

```bash
bun install
bun run dev
```

Then open http://localhost:5173. The Vite dev server proxies `/api` to the Bun server on port 3000.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the API server and Vite dev client |
| `bun run build` | Typecheck and build the client to `dist/` |
| `bun run start` | Run the production server (serves `dist/`) |
| `bun run typecheck` | Typecheck all projects |
| `bun run lint` | Lint with oxlint |
| `bun run test` | Run the test suite |
| `bun run test:coverage` | Run tests with coverage |

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/announce` | Body: `{ "topic"?: string, "message"?: string }`. Returns `{ "ok": true, "listeners": n }`. |
| `GET` (WebSocket) | `/api/v1/listen?topic=…` | Subscribe to announcements. Omit `topic` to receive all. |

```bash
curl -X POST http://localhost:3000/api/v1/announce \
  -H "Content-Type: application/json" \
  -d '{"topic":"ops","message":"Deploy finished"}'
```

## Project structure

```
apps/web/       Server (Hono on Bun) and client (React + Vite)
libs/messages/  Announcement validation and delivery rules
libs/topics/    Topic normalization and matching
libs/sounds/    Notification sound playback
libs/ui/        Shared React components
```

## Deployment

The repo includes a `render.yaml` Blueprint. In Render: **New +** → **Blueprint** → select this repo. See `render.yaml` for build and start commands.

> **Note:** announcements are held in memory. They are lost on restart, and only one instance should run.

## Contributing

1. Fork and create a branch.
2. Run `bun run typecheck && bun run lint && bun run test` before opening a PR.
3. Keep PRs focused and describe what changed and why.
