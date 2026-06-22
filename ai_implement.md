# Stocky Service — AI Analysis Implementation Plan

## Goal

Add an AI analysis feature to `stocky-service` that reads existing stored price data from PostgreSQL, analyzes daily symbol movement, and sends a scheduled report.

The AI report should answer:

- Which symbols look interesting today?
- Which symbols should be avoided for now?
- Which symbols are worth focusing on?
- Why, based only on the DB data and symbol config?

This feature must not replace the existing price watcher. It should be added as a separate module and separate worker process inside the same repo.

---

## Core Design Decision

Use this architecture:

```txt
stock-watcher service
  -> collects prices
  -> stores snapshots
  -> updates daily metrics
  -> handles live alerts

ai-analysis worker
  -> reads existing DB data
  -> builds structured analysis input
  -> calls LLM
  -> saves AI report
  -> optionally sends Telegram report
```

Do not put LLM calls inside the live Finnhub stream, price snapshot service, or alert evaluation path.

The existing data path must stay reliable and boring. AI analysis is a cold-path scheduled job.

---

## What This Is Not

Do not build a full autonomous agent in this phase.

Avoid this:

```txt
AI decides which SQL to run
AI decides which symbols to analyze
AI writes directly to config
AI sends random alerts whenever it wants
```

Build this instead:

```txt
Code controls the workflow.
Code reads the DB.
Code calculates the numbers.
LLM only explains the prepared data.
```

The LLM should be treated as a narrator, not as the source of truth.

---

## Desired Runtime Behavior

Add a scheduled AI report job.

Example target schedule:

```txt
20:00 Asia/Bangkok / GMT+7
```

Purpose:

```txt
Run before the configured market window opens.
Analyze the latest available daily price metrics.
Send a pre-market focus report to Telegram.
```

The schedule should be configurable, not hardcoded.

Example config:

```json
{
  "aiAnalysis": {
    "enabled": true,
    "reportTimes": ["20:00"],
    "timezone": "Asia/Bangkok",
    "provider": "ollama",
    "baseUrl": "http://host.docker.internal:11434",
    "model": "qwen2.5:7b",
    "minDailySnapshots": 5,
    "timeframes": ["1d"],
    "notifyTelegram": true,
    "maxSymbolsInReport": 8
  }
}
```

Later, support multiple report times:

```json
"reportTimes": ["20:00", "23:00", "02:30"]
```

---

## Recommended File Structure

Add these files/modules:

```txt
src/
  ai-main.ts

  jobs/
    ai-analysis-report.job.ts

  scheduler/
    ai-analysis.scheduler.ts

  modules/
    analysis/
      analysis-input.service.ts
      analysis-classifier.service.ts
      ai-analysis-report.service.ts
      ai-analysis-prompt.ts
      ai-report.formatter.ts

    llm/
      llm.provider.ts
      ollama-llm.provider.ts

    notifications/
      telegram-notification.provider.ts
```

Notes:

- `ai-main.ts` is a separate entry point from `main.ts`.
- The existing stock watcher continues to use `main.ts`.
- The AI worker runs separately using `ai-main.ts`.
- Reuse the existing Prisma client.
- Reuse the existing Telegram notification provider if possible.

---

## Package Scripts

Add scripts:

```json
{
  "scripts": {
    "dev:ai": "tsx watch src/ai-main.ts",
    "start:ai": "node dist/ai-main.js"
  }
}
```

Expected usage:

```bash
npm run dev
npm run dev:ai
```

Production usage after build:

```bash
npm run build
npm run start
npm run start:ai
```

---

## Database Changes

Add a table for AI reports.

Prisma model example:

```prisma
model AiAnalysisReport {
  id          String   @id @default(uuid()) @db.Uuid
  symbolId    String?  @map("symbol_id") @db.Uuid
  ticker      String?  @db.VarChar(40)

  reportType  String   @map("report_type") @db.VarChar(40)
  timeframe   String   @db.VarChar(20)

  inputJson   Json     @map("input_json")
  outputJson  Json?    @map("output_json")

  title       String   @db.VarChar(200)
  summary     String
  category    String?  @db.VarChar(30)
  riskLevel   String?  @map("risk_level") @db.VarChar(30)
  confidence  Decimal? @db.Decimal(5, 4)

  createdAt   DateTime @default(now()) @map("created_at")

  symbol Symbol? @relation(fields: [symbolId], references: [id])

  @@index([symbolId, timeframe, createdAt])
  @@index([reportType, createdAt])
  @@map("ai_analysis_reports")
}
```

Report types:

```txt
pre_market_daily
mid_market_update
end_of_day_summary
single_symbol_analysis
```

Category values:

```txt
interesting
focus
avoid
neutral
```

The first version can save one row per symbol, or one row for the whole report.

Simplest first implementation:

```txt
one ai_analysis_reports row per scheduled report
symbolId = null
ticker = null
inputJson = all analyzed symbols
outputJson = structured LLM result
summary = final Telegram message
```

This is easier for a daily report.

---

## Analysis Input Service

Create:

```txt
src/modules/analysis/analysis-input.service.ts
```

Responsibility:

- Read configured watchlist symbols.
- Read latest `daily_price_metrics`.
- Read recent `price_snapshots` only when needed.
- Build a compact JSON payload.
- Do not pass huge raw DB rows to the LLM.

Example output:

```json
{
  "reportType": "pre_market_daily",
  "timezone": "Asia/Bangkok",
  "generatedAt": "2026-06-20T20:00:00+07:00",
  "symbols": [
    {
      "ticker": "NVDA",
      "latestPrice": 142.3,
      "dailyHigh": 145.0,
      "dailyLow": 137.8,
      "dailyAverage": 140.2,
      "changePercent": 1.25,
      "snapshotCount": 530,
      "positionInRange": "near_high",
      "volatilityLabel": "medium",
      "dataQuality": "ok"
    }
  ]
}
```

Do not send this to the LLM:

```json
{
  "rawSnapshots": ["thousands of rows"]
}
```

LLM input should be compact, already calculated, and easy to explain.

---

## Basic Code-Based Classification

Before calling the LLM, classify each symbol using deterministic code.

Create:

```txt
src/modules/analysis/analysis-classifier.service.ts
```

Possible rules:

```txt
interesting:
  - price near daily low after large drop
  - price near daily high with strong positive movement
  - abnormal volatility
  - big move compared with other watchlist symbols

focus:
  - clear momentum
  - near breakout range
  - high movement but not too chaotic
  - enough snapshots and clean data

avoid:
  - too few snapshots
  - very unstable movement
  - unclear direction
  - already extended near high after large move
  - weak movement with high volatility

neutral:
  - nothing special
```

Important:

- These categories are observation labels, not buy/sell recommendations.
- Do not output direct financial advice.
- Do not say “buy this” or “sell this.”
- Use “worth watching,” “avoid chasing,” “needs confirmation,” etc.

Example classified symbol:

```json
{
  "ticker": "NVDA",
  "categoryCandidate": "focus",
  "reasons": [
    "Price is near the upper part of the daily range.",
    "Daily change is positive.",
    "Snapshot count is enough for analysis."
  ]
}
```

The LLM should explain and rank these candidates.

---

## LLM Provider

Create interface:

```txt
src/modules/llm/llm.provider.ts
```

```ts
export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmProvider {
  completeJson(messages: LlmMessage[]): Promise<unknown>;
}
```

Create Ollama implementation:

```txt
src/modules/llm/ollama-llm.provider.ts
```

Requirements:

- Use Ollama `/api/chat`.
- Use `stream: false`.
- Use `format: "json"`.
- Parse JSON safely.
- Throw useful errors on failed request or invalid JSON.
- Keep provider replaceable for future OpenAI-compatible providers.

Environment/config should allow:

```txt
provider = ollama
baseUrl = http://host.docker.internal:11434
model = qwen2.5:7b
```

---

## Prompt Design

Create:

```txt
src/modules/analysis/ai-analysis-prompt.ts
```

System message:

```txt
You analyze stock price movement from structured data.
Use only the provided data.
Do not provide financial advice.
Do not recommend buy or sell.
Classify symbols as interesting, focus, avoid, or neutral.
Return only valid JSON.
```

User payload should include:

```json
{
  "task": "Create a scheduled pre-market daily stock focus report.",
  "rules": [
    "Use only provided DB-derived data.",
    "Do not claim certainty.",
    "Do not use outside news.",
    "Do not say buy or sell.",
    "Explain why each symbol is interesting, avoid, focus, or neutral.",
    "Prefer short practical wording for Telegram."
  ],
  "outputSchema": {
    "title": "string",
    "overallSummary": "string",
    "interesting": [
      {
        "ticker": "string",
        "reason": "string",
        "riskLevel": "low | medium | high"
      }
    ],
    "focus": [
      {
        "ticker": "string",
        "reason": "string",
        "riskLevel": "low | medium | high"
      }
    ],
    "avoid": [
      {
        "ticker": "string",
        "reason": "string",
        "riskLevel": "low | medium | high"
      }
    ],
    "neutral": [
      {
        "ticker": "string",
        "reason": "string"
      }
    ],
    "telegramMessage": "string"
  },
  "data": {}
}
```

---

## Expected AI Output

The LLM must return JSON similar to this:

```json
{
  "title": "Pre-market Daily Focus Report",
  "overallSummary": "Most symbols are mixed. NVDA and AVGO show stronger movement, while FLNC looks unstable and should not be chased.",
  "interesting": [
    {
      "ticker": "AVGO",
      "reason": "Trading near the upper part of its daily range with positive movement. Worth watching for continuation, but not enough data to assume breakout.",
      "riskLevel": "medium"
    }
  ],
  "focus": [
    {
      "ticker": "NVDA",
      "reason": "Positive daily movement with enough snapshots and a clear range. Better candidate to monitor than low-data symbols.",
      "riskLevel": "medium"
    }
  ],
  "avoid": [
    {
      "ticker": "FLNC",
      "reason": "Movement is unstable and data does not show clean direction. Avoid chasing until the range becomes clearer.",
      "riskLevel": "high"
    }
  ],
  "neutral": [
    {
      "ticker": "GOOGL",
      "reason": "No strong signal from the current daily range."
    }
  ],
  "telegramMessage": "📊 Pre-market Daily Focus\n\nFocus: NVDA — positive movement with clean range.\nInteresting: AVGO — near upper range, watch continuation.\nAvoid chasing: FLNC — unstable movement.\n\nThis is a data summary, not financial advice."
}
```

---

## Report Formatter

Create:

```txt
src/modules/analysis/ai-report.formatter.ts
```

This should format the final Telegram message from either:

- LLM `telegramMessage`, or
- structured LLM JSON fields if `telegramMessage` is missing.

Telegram format should be short:

```txt
📊 Pre-market Daily Focus — 20:00 GMT+7

🔥 Focus
• NVDA — positive daily movement, clean range, enough snapshots.

👀 Interesting
• AVGO — near upper range, watch continuation.

⚠️ Avoid chasing
• FLNC — unstable movement, unclear direction.

😐 Neutral
• GOOGL — no strong signal today.

Data-only summary. Not financial advice.
```

Keep the message under Telegram practical length.

---

## Scheduler

Create:

```txt
src/scheduler/ai-analysis.scheduler.ts
```

Requirements:

- Use `aiAnalysis.reportTimes`.
- Use `aiAnalysis.timezone`, default to app timezone.
- Run once per configured time.
- Should not run if `aiAnalysis.enabled = false`.
- Should avoid overlapping runs.
- Log start, success, failure.

Example behavior:

```txt
20:00 Asia/Bangkok:
  run AiAnalysisReportJob
```

Use existing scheduling style if possible.

---

## AI Job

Create:

```txt
src/jobs/ai-analysis-report.job.ts
```

Flow:

```txt
1. Load AI config.
2. Build analysis input from DB and watchlist.
3. If not enough data, save/report "not enough data".
4. Classify symbols with deterministic code.
5. Build LLM prompt.
6. Call LLM provider.
7. Validate output JSON.
8. Save report to ai_analysis_reports.
9. Send Telegram if enabled.
```

Pseudo-code:

```ts
export class AiAnalysisReportJob {
  async run(): Promise<void> {
    const input = await analysisInputService.buildPreMarketDailyInput();

    if (input.symbols.length === 0) {
      logger.info("No symbols available for AI analysis.");
      return;
    }

    const classifiedInput = analysisClassifierService.classify(input);

    const llmOutput = await aiAnalysisReportService.generateReport(classifiedInput);

    await aiAnalysisReportService.saveReport({
      reportType: "pre_market_daily",
      timeframe: "1d",
      inputJson: classifiedInput,
      outputJson: llmOutput,
      summary: llmOutput.telegramMessage ?? llmOutput.overallSummary
    });

    if (config.aiAnalysis.notifyTelegram) {
      await notificationProvider.notify(formatTelegramReport(llmOutput));
    }
  }
}
```

---

## App Entry Point

Create:

```txt
src/ai-main.ts
```

Responsibility:

```txt
load config
create Prisma-backed services
create LLM provider
create Telegram provider if enabled
create AI scheduler
start scheduler
```

Do not start Finnhub WebSocket from `ai-main.ts`.

Do not start the normal stock watcher from `ai-main.ts`.

---

## Docker Compose

After local testing, add another service using the same image:

```yaml
services:
  stock-watcher:
    build: .
    command: npm run start
    depends_on:
      - postgres
    env_file:
      - .env
    volumes:
      - ./config:/app/config:ro

  ai-worker:
    build: .
    command: npm run start:ai
    depends_on:
      - postgres
    env_file:
      - .env
    volumes:
      - ./config:/app/config:ro
```

Optional Ollama service can be added later. For first implementation, it is fine to call Ollama running on the host machine:

```txt
http://host.docker.internal:11434
```

---

## Acceptance Criteria

The feature is done when:

- `npm run dev` still starts the original stock watcher.
- `npm run dev:ai` starts only the AI analysis worker.
- AI worker does not connect to Finnhub.
- AI worker reads from existing DB tables.
- AI worker supports scheduled report time like `20:00` Asia/Bangkok.
- AI worker calls Ollama through a replaceable LLM provider interface.
- AI worker saves report result to `ai_analysis_reports`.
- AI worker sends Telegram report when enabled.
- AI output uses categories:
  - interesting
  - focus
  - avoid
  - neutral
- AI output never says direct buy/sell advice.
- If Ollama is unavailable, stock watcher still works.
- If AI report fails, error is logged and does not affect price collection.

---

## Future Phase: Interactive AI Agent

Do not build this now, but design should allow it later.

Future feature:

```txt
Telegram /ask command
```

Example:

```txt
/ask compare NVDA and AVGO today
/ask why is FLNC marked avoid?
/ask which symbol is closest to daily low?
```

Later agent should use read-only tools:

```txt
getSymbolList()
getDailyMetrics(ticker, date)
getRecentSnapshots(ticker, timeframe)
getLatestAiReports(ticker)
compareSymbols(tickers, timeframe)
```

The future agent must not write SQL freely or change config in the first version.

---

## Implementation Order

Recommended order:

```txt
1. Add config schema for aiAnalysis.
2. Add Prisma AiAnalysisReport model and migration.
3. Add LLM provider interface.
4. Add Ollama provider.
5. Add analysis input service.
6. Add deterministic classifier service.
7. Add prompt builder.
8. Add AI report service.
9. Add Telegram formatter.
10. Add AI report job.
11. Add AI scheduler.
12. Add ai-main.ts.
13. Add package scripts.
14. Test manually with npm run dev:ai.
15. Add docker-compose ai-worker service.
```

---

## Important Notes

- AI analysis must use DB-derived data only.
- No outside news in this phase.
- No direct buy/sell recommendations.
- No LLM in the live price stream path.
- No autonomous DB agent in this phase.
- Code calculates; LLM narrates.
- DB remembers; Telegram reports.
