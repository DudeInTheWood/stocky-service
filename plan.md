# Stock Watcher - Phase 1 Requirements

## Overview

Build a personal stock monitoring system that tracks configured stock and ETF symbols, integrates with Finnhub WebSocket Trades for last-price updates, stores historical price snapshots, and keeps the architecture ready for future alert notifications.

This project is intended to run locally via Docker and act as the foundation for future analytics, portfolio tracking, and AI-assisted insights.

## Current Code Behavior

The codebase now implements the core Phase 1 runtime path instead of only describing the target architecture.

Implemented behavior:

* Loads runtime configuration from environment variables with sensible local defaults.
* Starts an HTTP API with `GET /health` and `GET /api/trades/websocket`.
* Builds Finnhub WebSocket Trades URLs and subscription messages from the configured watchlist.
* Starts and stops the Finnhub trade stream based on the configured market window.
* Keeps the latest trade per symbol in memory while the stream is running.
* Sends optional throttled Telegram live price-update notifications when trade messages arrive.
* Runs scheduled snapshot jobs during the market window.
* Upserts symbols into PostgreSQL and appends historical rows to `price_snapshots`.
* Recalculates and upserts `daily_price_metrics` after each successful snapshot insert.
* Evaluates configurable live price-drop alerts against cached daily metrics.
* Uses Prisma migrations for the current database schema.

Still scaffolded or pending:

* Generic buy/sell threshold alert evaluation is not implemented yet.
* `alert_rules` and `alert_events` exist in the database but are not actively used by the snapshot job.
* Telegram alert notifications are implemented for price updates, generic alert scaffolding, and live price-drop alerts.
* There is no dashboard, portfolio tracking, authentication, or user management.

---

# Objectives

Phase 1 focuses on:

1. Configurable stock/ETF watchlist
2. Finnhub WebSocket Trades integration
3. Throttled historical price storage during the configured market window
4. Clean architecture for future expansion

Out of scope for Phase 1:

* Web dashboard
* Authentication
* User management
* Portfolio analytics
* AI recommendations
* Mobile application

---

# Functional Requirements

## FR-001 Scheduled Price Snapshot Processing

The system must support a user-defined Thailand-time processing window and persist latest eligible prices at a configurable second-based interval while the window is open.

Timezone:

```text
Asia/Bangkok
```

Example configuration:

```json
{
  "marketWindow": {
    "start": "20:30",
    "end": "03:00"
  },
  "snapshotIntervalSeconds": 10
}
```

Requirements:

* Scheduler must support a market window that can cross midnight.
* Scheduler must respect Asia/Bangkok timezone.
* Scheduler must snapshot prices every 10 seconds by default.
* Scheduler must persist at most one price snapshot per symbol per configured interval.
* Scheduler must continue operating after container restart.
* Missed executions do not require recovery.

Current implementation notes:

* `StockFetchScheduler` reconciles the Finnhub stream once at startup and then every minute.
* The stream is started while the market window is open and stopped outside the window.
* Snapshot jobs use a timer based on `PRICE_SNAPSHOT_INTERVAL_SECONDS`.
* If a previous snapshot run is still active, the next tick is skipped.
* The default market window is `20:30` to `03:00` in `Asia/Bangkok`.

---

## FR-002 Watchlist Management

The system must maintain a configurable list of symbols.

Example:

```json
{
  "symbols": [
    "AVGO",
    "NVDA",
    "FLNC",
    "VOO",
    "SCHD",
    "JEPQ",
    "SPCX"
  ]
}
```

Requirements:

* Support at least 20 symbols.
* Support both stocks and ETFs.
* Watchlist configuration should be editable without code changes.

Current implementation notes:

* Watchlist symbols are loaded from the `WATCHLIST_SYMBOLS` environment variable.
* The default symbols are `BINANCE:BTCUSDT`, `BINANCE:ETHUSDT`, `NVDA`, `SPCX`, `GOOGL`, `AVGO`, `FLNC`, and `INTC`.
* Symbols are persisted automatically when quotes are stored; the app upserts by ticker.

---

## FR-003 Last Price Update Integration

The system must integrate with Finnhub WebSocket Trades for last-price updates on the configured symbols.

Initial provider:

```text
Finnhub WebSocket Trades
API: https://finnhub.io/docs/api/websocket-trades
```

Requirements:

* Use the configured watchlist symbols for trade subscriptions.
* Require a Finnhub API key through environment configuration.
* Log failures.
* Provider implementation must be replaceable.

Suggested abstraction:

```typescript
interface TradesProvider {
  createWebSocketUrl(): string;
  createSubscribeMessages(symbols: string[]): string[];
}
```

Current implementation notes:

* `FinnhubTradesProvider` creates the WebSocket URL and subscribe payloads.
* `FinnhubTradeStreamService` owns the live WebSocket connection, subscription lifecycle, latest-trade cache, and unsubscribe behavior.
* `GET /api/trades/websocket` exposes the generated Finnhub connection details for local inspection.
* Missing `FINNHUB_API_KEY` causes WebSocket config generation to fail with an explicit error.

---

## FR-004 Historical Price Storage

Every scheduled snapshot must store the latest eligible observed trade prices from Finnhub WebSocket Trades.

Requirements:

* No overwriting historical records.
* Preserve complete snapshot history.
* Store fetch timestamp.
* Store symbol.
* Store price.
* Skip symbols that have not received a trade update yet.
* Skip symbols whose latest trade update arrived inside the per-symbol snapshot cooldown.

Current implementation notes:

* `StockFetchJob.run()` reads only snapshot-eligible quotes currently available in the in-memory latest-trade cache.
* If no quotes have arrived yet, the job logs and writes nothing.
* `FinnhubTradeStreamService` tracks the last successful snapshot time per symbol and only exposes a quote after the configured cooldown has passed.
* `PriceSnapshotService.storeQuotes()` upserts each symbol and creates one new `price_snapshots` row per quote.
* Snapshot rows include `price`, inferred `currency`, `market_timestamp`, `fetched_at`, and `source`.
* Currency is currently inferred as `USDT` for symbols ending in `USDT`; otherwise it defaults to `USD`.

Example:

| Symbol | Price  | Timestamp        |
| ------ | ------ | ---------------- |
| AVGO   | 238.50 | 2026-06-14 21:00 |
| AVGO   | 239.20 | 2026-06-14 21:30 |

---

## FR-005 Alert Rules

The system must support threshold-based alerts after alert evaluation is implemented.

Example:

```json
{
  "symbol": "AVGO",
  "buyBelow": 220,
  "sellAbove": 320
}
```

Requirements:

* Buy threshold alerts
* Sell threshold alerts
* Enable/disable alert rules
* Prevent excessive duplicate notifications

Current implementation notes:

* The database tables for alert rules and alert events already exist.
* `AlertRuleService.evaluateQuotes()` currently throws a not-implemented error.
* The current snapshot job does not call alert evaluation yet.

---

## FR-006 Telegram Notifications

The system must send Telegram messages when alert rules are triggered after price alerts are implemented.

Example:

```text
🚨 BUY SIGNAL

Symbol: AVGO
Current Price: $219.40
Target Price: $220.00
```

Additional notifications:

* Fetch success (optional)
* Fetch failure
* System startup

Current implementation notes:

* `TelegramNotificationProvider` can send startup, fetch-failure, alert, and price-update messages.
* Startup notification is sent when the app starts and Telegram credentials are configured.
* Live trade price updates can be sent immediately from `FinnhubTradeStreamService`.
* Live price updates are controlled by `TELEGRAM_NOTIFY_PRICE_UPDATES`.
* Live price updates are throttled per symbol by `TELEGRAM_PRICE_UPDATE_THROTTLE_SECONDS`.
* `.env.example` documents a 900-second throttle default, and `loadConfig()` uses the same fallback if the variable is omitted.
* Price-drop alerts can notify immediately when live price falls below the cached daily low by a configured percentage, after minimum daily snapshot count and cooldown checks pass.

---

# Non-Functional Requirements

## NFR-001 Low Cost

Requirements:

* Free market data provider
* Local deployment
* No recurring infrastructure costs

---

## NFR-002 Reliability

Requirements:

* Automatic restart on failure
* Docker-based deployment
* Persistent database storage

---

## NFR-003 Extensibility

Architecture must support future features:

* Analytics
* Portfolio tracking
* AI-generated summaries
* Dashboard UI
* Additional market data providers

---

# Technical Stack

## Runtime

```text
Node.js
TypeScript
```

---

## Database

```text
PostgreSQL
```

Purpose:

* Historical price storage
* Alert tracking
* Future analytics

---

## ORM

```text
Prisma
```

Requirements:

* Schema migrations
* Type-safe database access

---

## Scheduler

```text
node-cron
```

Requirements:

* Asia/Bangkok timezone support

---

## Trades Provider

Primary:

```text
Finnhub WebSocket Trades
API: https://finnhub.io/docs/api/websocket-trades
```

Price provider:

```text
Finnhub WebSocket Trades for real-time last-price updates.
```

---

## Notification Provider

Primary:

```text
Telegram Bot API
```

Future:

```text
Discord Webhook
```

---

## Current API

Health check:

```http
GET /health
```

Response:

```json
{ "status": "ok" }
```

Finnhub WebSocket Trades configuration:

```http
GET /api/trades/websocket
```

The response includes:

* `source`
* `symbols`
* `websocketUrl`
* `subscribeMessages`
* `createdAt`

This endpoint is useful for checking the generated Finnhub subscription configuration without opening the internal scheduler-managed stream manually.

---

## Deployment

```text
Docker
Docker Compose
```

Services:

```yaml
postgres
stock-watcher
```

---

# Current Database Schema

The schema is implemented in `prisma/schema.prisma` and created by the initial Prisma migration.

## symbols

```sql
id UUID PRIMARY KEY
ticker VARCHAR(20) UNIQUE
name VARCHAR(255)
enabled BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## price_snapshots

```sql
id UUID PRIMARY KEY
symbol_id UUID
price DECIMAL(18,4)
currency VARCHAR(10)
market_timestamp TIMESTAMP
fetched_at TIMESTAMP
source VARCHAR(50)
```

---

## alert_rules

```sql
id UUID PRIMARY KEY
symbol_id UUID
buy_below DECIMAL(18,4)
sell_above DECIMAL(18,4)
enabled BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## alert_events

```sql
id UUID PRIMARY KEY
rule_id UUID
snapshot_id UUID
message TEXT
sent_at TIMESTAMP
```

---

# Phase 1 Success Criteria

The following workflow is the current Phase 1 delivery target:

1. Docker containers start successfully.
2. PostgreSQL is available.
3. HTTP API starts successfully.
4. Scheduler starts with the Asia/Bangkok market window.
5. Finnhub WebSocket Trades stream subscribes to configured symbols during the window.
6. Latest eligible prices are stored in PostgreSQL every 10 seconds during the window.
7. Daily price metrics are recalculated from stored snapshots.
8. Live price-drop alerts can use cached daily metrics without replacing the app structure.
9. Generic alert rules and Telegram delivery can be expanded without replacing the app structure.

Current completion status:

* Items 3, 4, 5, 6, 7, 8, and 9 are represented in the code.
* Docker and PostgreSQL configuration exist in `docker-compose.yml`.
* Generic buy/sell alert rule evaluation remains the main unfinished Phase 1 behavior.
* Telegram startup, fetch-failure, alert-message formatting, throttled live price updates, and live price-drop alert delivery exist.

Example:

```text
20:30 Bangkok Time
↓
Open Finnhub WebSocket Trades stream
↓
Subscribe to configured symbols
↓
Every configured interval, read latest eligible observed prices
↓
Append price snapshots to PostgreSQL
```

Completion of this workflow constitutes successful delivery of Phase 1.
