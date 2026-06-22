# Stock Watcher

A configurable stock, ETF, and crypto monitoring service.

The service can collect live market prices, store scheduled snapshots, calculate daily metrics, send notification alerts, and generate scheduled AI analysis reports from stored data. Notification delivery currently supports Telegram and Discord webhooks.

For implementation details, see [docs/architecture.md](docs/architecture.md).

## Setup

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env
```

Fill in the required secrets for the providers you plan to use.

```text
DATABASE_URL
CONFIG_FILE
FINNHUB_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
DISCORD_WEBHOOK_URL
```

Only `DATABASE_URL`, `CONFIG_FILE`, and `FINNHUB_API_KEY` are required for the core watcher. Telegram and Discord values are only needed when those notification paths are enabled.

## Configuration

Runtime behavior lives in [config/app.json](config/app.json). Use [config/app.example.json](config/app.example.json) as the template for new environments.

The main config areas are:

- `server`: HTTP host and port.
- `timezone`: timezone used for schedules and daily metrics.
- `marketWindow`: active monitoring window.
- `snapshotIntervalSeconds`: how often to persist latest observed prices.
- `watchlistSymbols`: symbols to monitor.
- `telegram`: Telegram notification behavior.
- `discord`: Discord webhook notification behavior.
- `priceDropAlert`: live price-drop alert rules.
- `aiAnalysis`: scheduled AI report behavior and LLM provider settings.

Keep real tokens and webhook URLs in `.env` when possible. `DISCORD_WEBHOOK_URL` overrides `discord.webhookUrl` from JSON config.

## Running Locally

Start the local Docker stack:

```bash
npm run local:start
```

This starts the database, applies migrations, and starts both runtime services:
the price watcher and the scheduled AI report worker.

Stop the local Docker stack:

```bash
npm run local:stop
```

Run the watcher directly on the host:

```bash
npm run dev
```

Run the AI worker directly on the host:

```bash
npm run dev:ai
```

Run one AI report immediately:

```bash
npm run dev:ai:run
```

If you run host-side commands while the database is in Docker, make sure `DATABASE_URL` points to the host-published database address.

For Docker-based local runs, Ollama on your host machine should be configured as:

```text
http://host.docker.internal:11434
```

For host-side `npm run dev:ai` or `npm run dev:ai:run`, Ollama can use:

```text
http://127.0.0.1:11434
```

## AI Reports

AI analysis is a separate worker from the live price watcher. It reads stored database metrics, builds a compact analysis input, asks the configured LLM provider for a report, saves the result, and optionally sends the report to enabled notification providers.

Important config fields:

- `aiAnalysis.enabled`: enables scheduled AI reports.
- `aiAnalysis.reportTimes`: report schedule times.
- `aiAnalysis.baseUrl`: LLM provider base URL.
- `aiAnalysis.model`: model name.
- `aiAnalysis.notifyTelegram`: sends reports to Telegram.
- `aiAnalysis.notifyDiscord`: sends reports to Discord.

When the AI worker runs in Docker and the LLM provider runs on the host machine, use `http://host.docker.internal:11434` in config. Inside a container, `127.0.0.1` points at the container itself rather than the host.

## Notifications

Telegram uses:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Discord uses either:

```text
DISCORD_WEBHOOK_URL
```

or the JSON config field:

```json
{
  "discord": {
    "webhookUrl": "",
    "username": ""
  }
}
```

Prefer `.env` for real secrets.

## API

Health check:

```http
GET /health
```

Trade stream subscription preview:

```http
GET /api/trades/websocket
```

## Database

Prisma commands:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
```

The database stores configured symbols, price snapshots, daily metrics, alert records, and saved AI reports.

## Quality Checks

```bash
npm test
npm run lint
npm run build
```
