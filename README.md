# mitot

A real-time, multi-column workspace for selected WhatsApp groups. Incoming messages are debounced in Redis, classified with OpenAI, stored in PostgreSQL, and broadcast to the Next.js dashboard. Dashboard replies are queued and sent through the authenticated WhatsApp client.

## Architecture

| Service | Responsibility |
| --- | --- |
| `apps/feed` | Next.js dashboard |
| `apps/server` | Fastify REST API and WebSocket endpoint |
| `services/worker` | BullMQ enrichment, classification, previews, and routing |
| `services/ingest` | Baileys WhatsApp connection and outbound replies |
| PostgreSQL + Redis | Persistent state and queues |

The WhatsApp session, media files, and environment credentials are intentionally ignored by Git.

## Run locally

Requirements: Node.js 20+, pnpm 9+, Docker, and an OpenAI API key.

```bash
cp .env.example .env
# Set OPENAI_API_KEY in .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm --filter @deck/database exec prisma migrate dev --name init
pnpm dev
```

Open `http://localhost:3000`. The API and WebSocket endpoint run on port `3001`. Scan the QR printed by `@deck/ingest`; use comma-separated `WHATSAPP_GROUP_IDS` to limit ingestion.

## Deploy

The dashboard can run on Vercel. The API, worker, ingest client, PostgreSQL, Redis, persistent media storage, and WhatsApp session must run on persistent infrastructure; Vercel serverless functions cannot host the Baileys session or WebSocket service.

1. Deploy `apps/feed` as the Vercel project root.
2. Deploy `apps/server`, `services/worker`, and `services/ingest` on a persistent host with PostgreSQL, Redis, and durable media storage.
3. In Vercel, set `INTERNAL_API_URL` to the public HTTPS URL of `apps/server` and redeploy.
4. Set `WEB_ORIGIN` on the API host to the Vercel deployment URL.

Never commit `.env`, WhatsApp authentication directories, media storage, or production credentials.

## Queue contracts

- `message-enrichment`: validated WhatsApp group messages, delayed by `DEBOUNCE_MS` before classification.
- `whatsapp-outbound`: validated UI replies, consumed by the authenticated Baileys connection.
- `deck-events`: Redis Pub/Sub channel carrying persisted `message.created` events to WebSocket clients.

## License

[MIT](LICENSE)
