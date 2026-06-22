# Stock Watcher

Personal stock, ETF, and crypto monitoring service.

It collects live prices from Finnhub, stores scheduled price snapshots in PostgreSQL, calculates daily metrics, sends Telegram alerts, and can run a scheduled Ollama-backed AI analysis report. AI reports can be delivered to Telegram and Discord.

For deeper design details, see [docs/architecture.md](docs/architecture.md).

## Requirements

- Node.js 22+
- Docker and Docker Compose
- PostgreSQL, usually started through Docker Compose
- Finnhub API key
- Ollama running locally when using AI reports
- Telegram bot credentials if Telegram notifications are enabled
- Discord webhook URL if Discord AI report notifications are enabled

## Environment

Copy `.env.example` to `.env` and fill the values you need.

```text
DATABASE_URL="postgresql://stock_watcher:stock_watcher@postgres:5432/stock_watcher?schema=public"
CONFIG_FILE="config/app.json"
FINNHUB_API_KEY=""
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
DISCORD_WEBHOOK_URL=""
```

Notes:

- Use `postgres` as the database host when running inside Docker Compose.
- Use `127.0.0.1` as the database host for host-side commands.
- `DISCORD_WEBHOOK_URL` overrides `discord.webhookUrl` from `config/app.json`.

## Runtime Config

Runtime behavior is configured in [config/app.json](config/app.json). A safe template lives in [config/app.example.json](config/app.example.json).

Main sections:

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "timezone": "Asia/Bangkok",
  "marketWindow": {
    "start": "20:30",
    "end": "03:00"
  },
  "snapshotIntervalSeconds": 10,
  "watchlistSymbols": ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT", "NVDA"],
  "telegram": {
    "notifyPriceUpdates": true,
    "priceUpdateThrottleSeconds": 900
  },
  "discord": {
    "webhookUrl": "",
    "username": "Stocky AI"
  },
  "priceDropAlert": {
    "enabled": true,
    "defaultDropPercent": 3,
    "symbolDropPercents": {
      "BINANCE:BTCUSDT": 5
    },
    "cooldownSeconds": 900,
    "minDailySnapshots": 5
  },
  "aiAnalysis": {
    "enabled": true,
    "reportTimes": ["20:00"],
    "timezone": "Asia/Bangkok",
    "provider": "ollama",
    "baseUrl": "http://127.0.0.1:11434",
    "model": "qwen3.5:4b",
    "minDailySnapshots": 5,
    "timeframes": ["1d"],
    "notifyTelegram": true,
    "notifyDiscord": false,
    "maxSymbolsInReport": 8
  }
}
```

When the AI worker runs inside Docker and Ollama runs on the host machine, set:

```json
"baseUrl": "http://host.docker.internal:11434"
```

## Common Commands

Install dependencies:

```bash
npm install
```

Run tests and type checks:

```bash
npm test
npm run lint
npm run build
```

Start the local Docker service stack:

```bash
npm run local:start
```

This starts Postgres, waits for it to be ready, applies Prisma migrations against `127.0.0.1:5432`, and starts the stock watcher container.

Stop the local Docker service stack:

```bash
npm run local:stop
```

Run the stock watcher directly on the host:

```bash
npm run dev
```

Run the AI worker directly on the host:

```bash
npm run dev:ai
```

Run one AI report immediately:

```bash
DATABASE_URL="postgresql://stock_watcher:stock_watcher@127.0.0.1:5432/stock_watcher?schema=public" npm run dev:ai:run
```

## AI Report Notifications

Telegram AI reports use:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
aiAnalysis.notifyTelegram=true
```

Discord AI reports use either:

```text
DISCORD_WEBHOOK_URL
aiAnalysis.notifyDiscord=true
```

or:

```json
{
  "discord": {
    "webhookUrl": "https://discord.com/api/webhooks/...",
    "username": "Stocky AI"
  },
  "aiAnalysis": {
    "notifyDiscord": true
  }
}
```

Prefer `.env` for real webhook values so secrets do not get committed.

## API

Health check:

```http
GET /health
```

Finnhub WebSocket subscription preview:

```http
GET /api/trades/websocket
```

Example:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/trades/websocket
```

## Database

Prisma commands:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
```

The schema stores:

- configured symbols
- price snapshots
- daily price metrics
- alert records
- saved AI analysis reports
