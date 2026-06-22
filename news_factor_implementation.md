# Stocky Service - Market Attention Factors Implementation Plan

## Goal

Evolve the AI analysis feature from a price-only daily report into a **market attention manager**.

The system should help answer:

- Which symbols deserve attention today?
- Why are they worth watching?
- Is attention driven by price movement, fundamentals, news flow, or data quality?
- Which symbols are noisy or low-signal today?

This should not become a buy/sell recommender. The output language should stay observational:

- "worth monitoring"
- "attention increased"
- "news flow is active"
- "valuation context is stretched"
- "needs confirmation"
- "avoid chasing"

Avoid direct financial advice:

- "buy"
- "sell"
- "enter"
- "exit"
- "this will go up"
- "this will go down"

---

## Why Daily Prices Are Not Enough

The current AI report uses stored daily price metrics:

- latest price
- daily high
- daily low
- daily average
- change percent
- snapshot count
- range position
- volatility label

That is useful for short-term movement, but it misses important attention signals:

- A symbol may be quiet in price but active in news.
- A symbol may have a strong move, but the move may be low-context noise.
- A high P/E or weak margin profile may change how we describe momentum.
- A headline cluster may explain why volatility deserves attention.
- Some symbols may need attention because of upcoming or fresh company events, not price movement alone.

The next phase should add **news and fundamental context** as separate factors, then let the AI explain the combined attention picture.

---

## Proposed Feature Name

Use language like:

```txt
market attention factors
attention score
attention report
news factor
fundamental context
```

Avoid naming that implies trading advice:

```txt
buy score
sell score
trade signal
recommendation engine
```

---

## Candidate APIs

Use Finnhub APIs first because the project already depends on Finnhub.

### Company News

Purpose:

- Fetch recent company headlines for each watchlist symbol.
- Detect whether attention is supported by active news flow.
- Provide concise news context to the LLM.

Expected inputs:

```txt
symbol
from date
to date
```

Example use:

```txt
GET /api/v1/company-news?symbol=NVDA&from=2026-06-21&to=2026-06-22
```

Data to keep:

- headline
- summary
- source
- url
- datetime
- related symbol

Do not pass full article bodies to the LLM. Use headline, short summary, source, and timestamp only.

### Basic Financials

Purpose:

- Add fundamental context such as valuation, margins, growth, and profitability.
- Provide a slower-moving background factor for interpreting price/news movement.

Expected inputs:

```txt
symbol
metric = all
```

Example use:

```txt
GET /api/v1/stock/metric?symbol=NVDA&metric=all
```

Useful metrics to consider first:

- P/E ratio
- forward P/E if available
- P/S ratio
- P/B ratio
- gross margin
- operating margin
- net margin
- revenue growth
- EPS growth
- debt/equity
- 52-week high/low context

Do not overfit to one metric. Fundamentals should be context labels, not a final decision.

---

## Core Design Decision

Keep the current safe architecture:

```txt
stock-watcher service
  -> collects prices
  -> stores snapshots
  -> updates daily metrics
  -> handles live alerts

market-data-enrichment job
  -> fetches company news
  -> fetches basic financials
  -> stores normalized context

ai-analysis worker
  -> reads DB-derived price data
  -> reads stored news/fundamental context
  -> builds compact attention input
  -> calls LLM
  -> saves attention report
  -> optionally sends Telegram report
```

Do not let the LLM fetch news directly.
Do not let the LLM decide which external APIs to call.
Do not let the LLM write raw SQL.
Do not put news/fundamental fetches in the live Finnhub stream path.

Code controls workflow. The LLM explains prepared context.

---

## Recommended New File Structure

```txt
src/
  jobs/
    market-context-refresh.job.ts

  scheduler/
    market-context.scheduler.ts

  modules/
    market-context/
      company-news.provider.ts
      finnhub-company-news.provider.ts
      basic-financials.provider.ts
      finnhub-basic-financials.provider.ts
      company-news.service.ts
      basic-financials.service.ts
      market-attention-factor.service.ts

    analysis/
      attention-input.service.ts
      attention-classifier.service.ts
```

The current `analysis-input.service.ts` can either be extended or wrapped by a new `attention-input.service.ts`.

Prefer a new attention input service if the payload grows beyond price metrics. This keeps the current price-only path understandable.

---

## Database Changes

Add tables for normalized external context.

### `company_news_items`

One row per provider news item.

```prisma
model CompanyNewsItem {
  id              String   @id @default(uuid()) @db.Uuid
  symbolId        String   @map("symbol_id") @db.Uuid
  externalId      String?  @map("external_id") @db.VarChar(120)
  headline        String
  summary         String?
  source          String?  @db.VarChar(120)
  url             String?
  publishedAt     DateTime @map("published_at")
  fetchedAt       DateTime @default(now()) @map("fetched_at")
  provider        String   @db.VarChar(50)
  rawJson         Json?    @map("raw_json")

  symbol Symbol @relation(fields: [symbolId], references: [id])

  @@unique([provider, externalId])
  @@index([symbolId, publishedAt])
  @@index([publishedAt])
  @@map("company_news_items")
}
```

If Finnhub does not provide a stable news ID for every row, create a deterministic hash from:

```txt
provider + symbol + headline + url + publishedAt
```

### `company_basic_financials`

One latest row per symbol/provider, plus optional history later.

```prisma
model CompanyBasicFinancial {
  id          String   @id @default(uuid()) @db.Uuid
  symbolId    String   @map("symbol_id") @db.Uuid
  provider    String   @db.VarChar(50)
  metricJson  Json     @map("metric_json")
  fetchedAt   DateTime @default(now()) @map("fetched_at")

  symbol Symbol @relation(fields: [symbolId], references: [id])

  @@unique([symbolId, provider])
  @@index([fetchedAt])
  @@map("company_basic_financials")
}
```

Keep raw metric JSON first. Add typed columns later only for metrics we use often.

### Optional Later Table: `market_attention_factors`

Useful if we want to persist code-calculated factors separately from AI reports.

```txt
symbol_id
date
price_factor_json
news_factor_json
fundamental_factor_json
attention_score
created_at
```

This can wait until the factor model stabilizes.

---

## Config

Add a new config block:

```json
{
  "marketContext": {
    "enabled": true,
    "timezone": "Asia/Bangkok",
    "refreshTimes": ["19:30"],
    "newsLookbackDays": 2,
    "maxNewsItemsPerSymbol": 5,
    "fetchBasicFinancials": true,
    "basicFinancialsRefreshHours": 24,
    "provider": "finnhub"
  }
}
```

Relationship to AI config:

```json
{
  "aiAnalysis": {
    "enabled": true,
    "reportTimes": ["20:00"],
    "includeNewsFactors": true,
    "includeFundamentalFactors": true
  }
}
```

The context refresh should run before the AI report time.

---

## News Factor

Create a code-derived news factor per symbol.

Input:

- recent stored news items
- lookback window
- source count
- headline count
- recency

Possible fields:

```json
{
  "newsCount": 4,
  "sourceCount": 3,
  "latestHeadlineAt": "2026-06-22T12:30:00.000Z",
  "recencyLabel": "fresh",
  "activityLabel": "active",
  "headlines": [
    {
      "headline": "Example headline",
      "source": "Example Source",
      "publishedAt": "2026-06-22T12:30:00.000Z"
    }
  ],
  "reasons": [
    "Four news items appeared in the last two days.",
    "Latest headline is recent enough to affect attention."
  ]
}
```

Suggested labels:

```txt
quiet
normal
active
very_active
```

Recency labels:

```txt
fresh
recent
stale
none
```

Do not attempt deep sentiment in the first version. The first useful step is attention from news volume and recency.

Later, optional sentiment can be added with:

- LLM structured classification over headlines only
- FinBERT-style financial sentiment model
- provider sentiment data if available

---

## Fundamental Factor

Create a code-derived fundamental context per symbol.

Input:

- latest stored basic financial metrics
- selected metrics only

Possible fields:

```json
{
  "valuationLabel": "high",
  "profitabilityLabel": "strong",
  "growthLabel": "positive",
  "leverageLabel": "normal",
  "metrics": {
    "peNormalizedAnnual": 42.3,
    "psAnnual": 18.4,
    "grossMarginAnnual": 74.1,
    "revenueGrowthTTMYoy": 22.5,
    "debtEquityAnnual": 0.32
  },
  "reasons": [
    "P/E is elevated compared with broad market norms.",
    "Gross margin appears strong."
  ]
}
```

Suggested labels:

```txt
valuationLabel:
  low
  normal
  high
  extreme
  unknown

profitabilityLabel:
  weak
  normal
  strong
  unknown

growthLabel:
  negative
  flat
  positive
  strong
  unknown

leverageLabel:
  low
  normal
  high
  unknown
```

Be careful with cross-sector comparisons. A high P/E means different things for software, semiconductors, banks, and ETFs. First version should phrase this as context:

```txt
"valuation context is elevated"
```

not:

```txt
"overvalued"
```

---

## Attention Score

A simple first version can calculate a transparent score from code:

```txt
attentionScore = priceScore + newsScore + fundamentalContextScore
```

Example weighting:

```txt
priceScore: 0-50
newsScore: 0-30
fundamentalContextScore: 0-20
```

Price score examples:

- large absolute daily move
- near high/low
- high volatility
- enough snapshot count

News score examples:

- fresh news item in last 12 hours
- multiple news items in lookback window
- multiple independent sources

Fundamental context score examples:

- unusual valuation context
- strong/weak profitability
- strong/weak growth

The score should mean:

```txt
How much attention does this symbol deserve today?
```

It should not mean:

```txt
How likely this is to make money.
```

---

## AI Input Shape

Build compact input like:

```json
{
  "reportType": "pre_market_attention",
  "timezone": "Asia/Bangkok",
  "generatedAt": "2026-06-22T20:00:00+07:00",
  "symbols": [
    {
      "ticker": "NVDA",
      "priceFactor": {
        "changePercent": 1.25,
        "positionInRange": "near_high",
        "volatilityLabel": "medium",
        "dataQuality": "ok"
      },
      "newsFactor": {
        "activityLabel": "active",
        "recencyLabel": "fresh",
        "newsCount": 3,
        "headlines": []
      },
      "fundamentalFactor": {
        "valuationLabel": "high",
        "profitabilityLabel": "strong",
        "growthLabel": "positive"
      },
      "attentionScore": 78,
      "attentionReasons": [
        "Positive price movement near daily high.",
        "Fresh company news appeared in the last day.",
        "Fundamental context shows elevated valuation and strong profitability."
      ]
    }
  ]
}
```

Do not include huge raw news payloads.
Do not include unrelated financial metrics.
Do not include full article bodies.

---

## AI Output Shape

Shift output away from recommendation language.

```json
{
  "title": "Pre-market Attention Report",
  "overallSummary": "Attention is concentrated in NVDA and AVGO because price movement is supported by fresh news flow. GOOGL is quiet today.",
  "highAttention": [
    {
      "ticker": "NVDA",
      "reason": "Price is near the upper daily range and news flow is fresh.",
      "attentionDrivers": ["price", "news"],
      "riskContext": "valuation context is elevated"
    }
  ],
  "watchlist": [
    {
      "ticker": "AVGO",
      "reason": "News activity increased while price movement remains orderly.",
      "attentionDrivers": ["news"]
    }
  ],
  "lowSignal": [
    {
      "ticker": "GOOGL",
      "reason": "Price and news flow are both quiet today."
    }
  ],
  "avoidChasing": [
    {
      "ticker": "SPCX",
      "reason": "Large move and high volatility make the signal noisy."
    }
  ],
  "telegramMessage": "string"
}
```

Suggested categories:

```txt
highAttention
watchlist
lowSignal
avoidChasing
```

These align better with "market attention manager" than:

```txt
focus
interesting
avoid
neutral
```

---

## Implementation Order

Recommended order:

```txt
1. Add marketContext config.
2. Add company_news_items and company_basic_financials tables.
3. Add Finnhub Company News provider.
4. Add Finnhub Basic Financials provider.
5. Add services to normalize and upsert fetched context.
6. Add market context refresh job.
7. Add market context scheduler.
8. Add code-derived news factor.
9. Add code-derived fundamental factor.
10. Add attention input service combining price, news, and fundamentals.
11. Update prompt/output schema from recommendation-like categories to attention categories.
12. Save enriched input/output into ai_analysis_reports.
13. Run one-shot report and compare output quality.
```

---

## Acceptance Criteria

The phase is done when:

- Market context refresh can fetch and store recent company news.
- Market context refresh can fetch and store basic financial metrics.
- AI report can include price, news, and fundamental factors.
- Report language uses market-attention framing.
- Report avoids buy/sell recommendations.
- LLM receives compact prepared context only.
- Existing stock watcher still runs without the AI/context worker.
- If Finnhub news/fundamental APIs fail, price collection still works.
- If Ollama fails, stored market context remains available.
- Telegram report clearly separates attention drivers:
  - price
  - news
  - fundamentals
  - data quality

---

## Important Notes

- Start with news volume and recency, not complex sentiment.
- Start with raw financial metric JSON plus a few selected labels, not a full fundamentals engine.
- Keep external API fetches scheduled and cached.
- Do not call Company News or Basic Financials inside the live stream path.
- Do not pass large raw payloads to the LLM.
- Keep the report explanatory, not advisory.
- The product identity is **market attention manager**.
