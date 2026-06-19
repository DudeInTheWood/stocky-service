# Architecture

## Goals

The Phase 1 architecture keeps external systems behind small modules so future work can add analytics, portfolio tracking, a dashboard, additional price providers, and notification providers without rewriting the core application flow.

## Boundaries

### Scheduler

Owns time-based execution. It receives a configured Asia/Bangkok market window and a snapshot interval. It starts the Finnhub trade stream while the window is open and triggers price snapshot jobs every 10 seconds by default.

### Stock Fetch Job

Coordinates one scheduled snapshot run.

1. Read latest snapshot-eligible trade prices from the Finnhub trade stream cache.
2. Upsert symbols.
3. Append price snapshots.
4. Recalculate daily price metrics.
5. Refresh the in-memory daily metric cache used by live alert checks.
6. Log provider or persistence failures.

### Trades Provider

Finnhub WebSocket Trades is the current external API integration for last-price updates.

Current provider:

- Finnhub WebSocket Trades
- Docs: https://finnhub.io/docs/api/websocket-trades

The local HTTP API exposes the WebSocket URL and subscription payloads for the configured watchlist. The scheduler also uses the provider to manage the live stream internally.

`FinnhubTradeStreamService` keeps the latest trade per symbol in memory, exposes only snapshot-eligible quotes to the scheduled job, evaluates live price-drop alerts, and sends throttled Telegram price-update notifications.

### Price Data

Price snapshot storage is implemented through Prisma. Every scheduled snapshot appends the latest eligible observed trade price per symbol to `price_snapshots`; rows are not overwritten. Rapid trade updates inside a symbol's snapshot cooldown are kept in memory but skipped for database persistence.

Daily price metrics are recalculated after each successful snapshot insert. The metric service groups snapshots by symbol and configured-timezone calendar day, then upserts one `daily_price_metrics` row containing open, close, high, low, average, snapshot count, previous close, and change values.

After each daily metric upsert, the app refreshes `DailyPriceMetricCache`. Live price-drop checks use this cache instead of querying or recalculating on every Finnhub tick.

### Storage

PostgreSQL stores symbols, historical snapshots, daily metrics, alert rules, and sent alert events. Prisma owns schema migrations and type-safe access.

### Notifications

The `NotificationProvider` interface isolates delivery. Phase 1 targets Telegram Bot API. Discord webhook support can be added later behind the same boundary.

Telegram live price-update notifications can optionally ask a `PriceUpdateContextProvider` for extra context. The current context provider reads the existing `daily_price_metrics` row for the symbol and current configured-timezone day, adding daily high, daily low, and snapshot count to the message without changing the notification throttle.

Price-drop alerts are modeled separately from regular price-update notifications. `PriceDropAlertService` compares live prices against cached daily metrics, using configurable default and per-symbol drop percentages, minimum daily snapshot count, and alert cooldown.
