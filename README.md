# WhatsApp Knowledge Deck

Real-time multi-column workspace backed by selected WhatsApp groups. Incoming group messages are debounced in Redis, classified by OpenAI, stored in PostgreSQL, and broadcast to the virtualized Next.js dashboard. Dashboard replies are queued and sent by the authenticated WhatsApp client.

## Run locally

1. Copy `.env.example` to `.env` and provide `OPENAI_API_KEY`.
2. Start Redis and PostgreSQL: `docker compose up -d`.
3. Install dependencies: `pnpm install`.
4. Generate and migrate the database: `pnpm db:generate && pnpm --filter @deck/database exec prisma migrate dev --name init`.
5. Start all services: `pnpm dev`.
6. Scan the QR printed by `@deck/ingest`; restrict ingestion with comma-separated `WHATSAPP_GROUP_IDS`.

The browser is served at `http://localhost:3000`; the API and WebSocket endpoint run on port `3001`.

## Queue contracts

- `message-enrichment`: validated WhatsApp group messages, delayed by `DEBOUNCE_MS` before classification.
- `whatsapp-outbound`: validated UI replies, consumed by the authenticated Baileys connection.
- `deck-events`: Redis Pub/Sub channel carrying persisted `message.created` events to WebSocket clients.
