# Architecture

## Goals

The architecture keeps external systems behind small modules so future work can add analytics, portfolio tracking, a dashboard, additional price providers, notification providers, and richer AI analysis without rewriting the core application flow.

## Boundaries

### Configuration

Runtime behavior is loaded from `config/app.json`, while secrets and deployment-only values come from environment variables. Docker Compose mounts the local `config` directory into the container, so behavior changes can be made by editing JSON and restarting the service instead of rebuilding the image.

### Scheduler

Owns time-based execution. It receives a configured Asia/Bangkok market window and a snapshot interval. It starts the Finnhub trade stream while the window is open and triggers price snapshot jobs every 10 seconds by default.

The AI analysis worker has its own scheduler in `src/scheduler/ai-analysis.scheduler.ts`. It uses `aiAnalysis.reportTimes` and `aiAnalysis.timezone`, skips overlapping runs, logs start/success/failure, and does not start the Finnhub stream.

### Stock Fetch Job

Coordinates one scheduled snapshot run.

1. Read latest snapshot-eligible trade prices from the Finnhub trade stream cache.
2. Upsert symbols.
3. Append price snapshots.
4. Recalculate daily price metrics.
5. Refresh the in-memory daily metric cache used by live alert checks.
6. Log provider or persistence failures.

### AI Analysis Job

Coordinates one scheduled or immediate AI report run.

1. Read the configured watchlist and latest stored daily metrics from PostgreSQL.
2. Build a compact JSON input with daily high, low, average, latest price, change percent, snapshot count, range position, volatility label, and data quality.
3. Classify each symbol with deterministic code before calling the model.
4. Send only the compact classified payload to the configured LLM provider.
5. Normalize the returned JSON into report buckets: `focus`, `interesting`, `avoid`, and `neutral`.
6. Format a short Telegram-friendly summary from the structured output.
7. Save one `ai_analysis_reports` row for the scheduled report.
8. Optionally send the summary through Telegram.

The LLM is treated as a narrator over prepared facts. It does not choose SQL, decide which symbols exist, write configuration, or run in the live price-stream path.

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

PostgreSQL stores symbols, historical snapshots, daily metrics, alert rules, sent alert events, and saved AI analysis reports. Prisma owns schema migrations and type-safe access.

### Notifications

The `NotificationProvider` interface isolates delivery. The current provider targets Telegram Bot API. Discord webhook support can be added later behind the same boundary.

Telegram live price-update notifications can optionally ask a `PriceUpdateContextProvider` for extra context. The current context provider reads the existing `daily_price_metrics` row for the symbol and current configured-timezone day, adding daily high, daily low, and snapshot count to the message without changing the notification throttle.

Price-drop alerts are modeled separately from regular price-update notifications. `PriceDropAlertService` compares live prices against cached daily metrics, using configurable default and per-symbol drop percentages, minimum daily snapshot count, and alert cooldown.

The AI worker reuses `TelegramNotificationProvider` through `notifyMessage()` for report delivery when `aiAnalysis.notifyTelegram` is enabled.

### LLM Provider

`src/modules/llm/llm.provider.ts` defines the replaceable LLM boundary. The current provider is `OllamaLlmProvider`, which calls Ollama `/api/chat` with:

- `stream: false`
- `format: "json"`
- `think: false`
- low temperature
- capped response length

The parser accepts valid JSON directly and also tolerates common model wrappers such as fenced JSON or surrounding text. This keeps local Qwen-family models usable while still normalizing the result before it is saved.

### Runtime Processes

There are two application entry points:

- `src/main.ts`: stock watcher. Starts Finnhub stream management, price snapshots, live alerts, Telegram price updates, and the HTTP API.
- `src/ai-main.ts`: AI worker. Starts only the AI report scheduler, or runs one report immediately with `--run-once`.

Local development commands:

```bash
npm run dev
npm run dev:ai
npm run dev:ai:run
```

The local AI setup currently targets Ollama at `http://127.0.0.1:11434` with model `qwen3.5:4b`. Docker containers should use `http://host.docker.internal:11434` to reach the host Ollama service.
