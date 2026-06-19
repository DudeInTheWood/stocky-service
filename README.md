# Stock Watcher

Personal stock and ETF monitoring service based on the Phase 1 requirements in `plan.md`.

## Current Status

The service currently supports Finnhub WebSocket Trades subscription configuration, scheduled stream management, throttled Telegram price-update notifications, throttled price snapshot persistence, daily price metrics, and configurable live price-drop alerts.

## Project Structure

```text
.
├── config/
│   ├── app.example.json
│   └── app.json
├── docs/
│   └── architecture.md
├── prisma/
│   ├── migrations/
│   │   └── 20260616000000_initial_schema/
│   └── schema.prisma
├── src/
│   ├── api/
│   │   └── http-api.server.ts
│   ├── config/
│   │   ├── app-config.ts
│   │   └── constants.ts
│   ├── db/
│   │   └── prisma.ts
│   ├── jobs/
│   │   └── stock-fetch.job.ts
│   ├── modules/
│   │   ├── alerts/
│   │   │   ├── alert-rule.service.ts
│   │   │   └── price-drop-alert.service.ts
│   │   ├── trades/
│   │   │   ├── finnhub-trade-stream.service.ts
│   │   │   └── finnhub-trades.provider.ts
│   │   ├── notifications/
│   │   │   ├── notification.provider.ts
│   │   │   ├── price-update-context.provider.ts
│   │   │   └── telegram-notification.provider.ts
│   │   └── prices/
│   │       ├── daily-price-metric-cache.ts
│   │       ├── daily-price-metric.calculator.ts
│   │       ├── daily-price-metric.service.ts
│   │       ├── daily-price-update-context.provider.ts
│   │       └── price-snapshot.service.ts
│   ├── scheduler/
│   │   └── stock-fetch.scheduler.ts
│   ├── types/
│   │   ├── alert.ts
│   │   ├── trade.ts
│   │   └── quote.ts
│   ├── app.ts
│   └── main.ts
├── docker-compose.yml
├── Dockerfile
├── package.json
├── plan.md
└── tsconfig.json
```

## Architecture Overview

The project uses a small modular architecture. Each external dependency sits behind an interface so the core workflow can stay stable when a provider changes.

- `src/main.ts`: application entry point. Loads config, creates the app, and starts it.
- `src/app.ts`: composition root. Wires together scheduler, job, services, and providers.
- `src/api`: HTTP API endpoints for direct local access.
- `src/config`: reads `config/app.json` plus secret environment variables and converts them into application config.
- `src/scheduler`: owns Thailand-time market-window execution and second-based snapshot ticks.
- `src/jobs`: owns use-case orchestration. `StockFetchJob` stores latest stream prices as snapshots.
- `src/modules/trades`: owns Finnhub WebSocket Trades configuration for last-price updates.
- `src/modules/prices`: owns historical price snapshot persistence, daily metric calculation, and metric cache state.
- `src/modules/alerts`: owns threshold alert scaffolding and live price-drop alert evaluation.
- `src/modules/notifications`: owns outbound notifications. Telegram is the Phase 1 provider.
- `src/db`: owns Prisma client setup.
- `src/types`: shared domain types used between modules.
- `prisma/schema.prisma`: database schema for symbols, snapshots, alert rules, and alert events.
- `config/app.json`: editable runtime behavior config for server, schedule, watchlist, notifications, and price-drop alerts.
- `config/app.example.json`: safe example config for new environments.

## Dependency Direction

High-level orchestration depends on interfaces. Provider-specific code stays at the edges.

```text
main.ts
  -> app.ts
    -> scheduler
      -> FinnhubTradeStreamService
    -> stock-fetch job
    -> PriceSnapshotService
      -> DailyPriceMetricService
      -> DailyPriceMetricCache
    -> PriceDropAlertService
    -> AlertRuleService
    -> NotificationProvider interface

FinnhubTradesProvider -> Finnhub WebSocket Trades
FinnhubTradeStreamService -> latest trade price cache
TelegramProvider     -> NotificationProvider
```

This keeps the app ready for future changes like storing trade updates, adding Discord notifications, or building dashboard/analytics features later.

## Planned Phase 1 Runtime Flow

```text
Scheduler
  -> if Bangkok market window is open, start FinnhubTradeStreamService
  -> every configured snapshot interval during the window
    -> StockFetchJob.run()
    -> read latest trade prices from stream cache
    -> PriceSnapshotService.storeQuotes()
    -> append rows to price_snapshots
    -> recalculate daily_price_metrics
    -> refresh DailyPriceMetricCache

FinnhubTradeStreamService
  -> receives live trades
  -> evaluates PriceDropAlertService against cached daily metrics
  -> sends throttled Telegram price updates
```

Error flow:

```text
Provider failure
  -> log failure
  -> NotificationProvider.notifyFetchFailure(error)
```

Startup flow:

```text
Application starts
  -> load config
  -> create providers and services
  -> notify startup
  -> start scheduler
  -> start HTTP API
```

## Scheduled Price Snapshots

Default market window:

```text
20:30 - 03:00 Asia/Bangkok
```

Default snapshot interval:

```text
10 seconds
```

During the configured window, the service keeps a Finnhub WebSocket Trades connection open for the configured watchlist. Every configured interval it stores the latest eligible observed price per symbol into PostgreSQL. Each symbol is persisted at most once per interval, so rapid Finnhub updates inside the interval are kept in memory but skipped for database writes. If a symbol has not received a trade update yet, no snapshot is written for that symbol on that tick.

## Telegram Notifications

Telegram uses the official Bot API `sendMessage` method. A bot token and chat ID are required.

When `telegram.notifyPriceUpdates` is enabled in `config/app.json`, live Finnhub trade updates can trigger Telegram messages. To prevent floods on high-volume symbols such as `BINANCE:BTCUSDT`, messages are throttled per symbol by `telegram.priceUpdateThrottleSeconds`, which defaults to 900 seconds.

Price-update messages include today's high and low from `daily_price_metrics` when that context is available. This does not change the notification throttle; the lookup runs only when a Telegram message is actually being sent.

Price-drop alerts are evaluated on live Finnhub trades using cached daily metrics. They can notify immediately when a live price falls below the cached daily low by a configured percent, after the minimum daily snapshot count is reached and the per-symbol cooldown allows it.

## Current API

The current API returns Finnhub WebSocket Trades connection details for the configured watchlist. This is Finnhub's "Trades - Last Price Updates" stream.

```http
GET /api/trades/websocket
```

Default configured symbols:

```text
BINANCE:BTCUSDT, BINANCE:ETHUSDT, NVDA, SPCX, GOOGL, AVGO, FLNC, INTC
```

Example local request:

```bash
curl http://localhost:3000/api/trades/websocket
```

Example response shape:

```json
{
  "source": "finnhub-websocket-trades",
  "symbols": ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT", "NVDA", "SPCX", "GOOGL", "AVGO", "FLNC", "INTC"],
  "websocketUrl": "wss://ws.finnhub.io/?token=...",
  "subscribeMessages": [
    "{\"type\":\"subscribe\",\"symbol\":\"BINANCE:BTCUSDT\"}",
    "{\"type\":\"subscribe\",\"symbol\":\"BINANCE:ETHUSDT\"}",
    "{\"type\":\"subscribe\",\"symbol\":\"NVDA\"}",
    "{\"type\":\"subscribe\",\"symbol\":\"SPCX\"}",
    "{\"type\":\"subscribe\",\"symbol\":\"GOOGL\"}",
    "{\"type\":\"subscribe\",\"symbol\":\"AVGO\"}",
    "{\"type\":\"subscribe\",\"symbol\":\"FLNC\"}",
    "{\"type\":\"subscribe\",\"symbol\":\"INTC\"}"
  ],
  "createdAt": "2026-06-16T00:00:00.000Z"
}
```

`FINNHUB_API_KEY` is required for this endpoint.

Health check:

```http
GET /health
```

## Database Design

The Prisma schema follows the Phase 1 plan:

- `symbols`: configured stock and ETF tickers.
- `price_snapshots`: append-only historical price records.
- `daily_price_metrics`: one recalculated row per symbol per configured-timezone day.
- `alert_rules`: buy-below and sell-above threshold rules.
- `alert_events`: record of sent alerts, used later to prevent excessive duplicate notifications.

## Provider Strategy

Primary trades provider:

- Finnhub WebSocket Trades, "Trades - Last Price Updates"
- Docs: https://finnhub.io/docs/api/websocket-trades

Current price stream:

- Finnhub WebSocket Trades provides real-time last-price updates.

Primary notification provider:

- Telegram Bot API

Future notification provider:

- Discord webhook

## Configuration

Runtime behavior is configured in `config/app.json`. Docker Compose mounts `./config` into the container, so changing watchlist symbols, schedule, notification throttles, or price-drop alert thresholds only requires a service restart, not an image rebuild.

Secrets and deployment-only values remain in `.env`. Copy `.env.example` to `.env`, then fill in required values:

```text
DATABASE_URL
CONFIG_FILE
FINNHUB_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Example behavior config:

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
  "watchlistSymbols": ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT", "NVDA", "SPCX", "GOOGL", "AVGO", "FLNC", "INTC"],
  "telegram": {
    "notifyPriceUpdates": true,
    "priceUpdateThrottleSeconds": 900
  },
  "priceDropAlert": {
    "enabled": true,
    "defaultDropPercent": 3,
    "symbolDropPercents": {
      "BINANCE:BTCUSDT": 5,
      "BINANCE:ETHUSDT": 5
    },
    "cooldownSeconds": 900,
    "minDailySnapshots": 5
  }
}
```

## Commands

```bash
npm install
npm run build
npm run dev
npm run prisma:generate
npm run prisma:migrate
```

## Docker

```bash
docker compose up --build
```
