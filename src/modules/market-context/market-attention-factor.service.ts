import { prisma } from "../../db/prisma.js";
import type { DataQuality, RangePosition, VolatilityLabel } from "../analysis/analysis-input.service.js";

export type NewsActivityLabel = "quiet" | "normal" | "active" | "very_active";
export type NewsRecencyLabel = "fresh" | "recent" | "stale" | "none";
export type ValuationLabel = "low" | "normal" | "high" | "extreme" | "unknown";
export type ProfitabilityLabel = "weak" | "normal" | "strong" | "unknown";
export type GrowthLabel = "negative" | "flat" | "positive" | "strong" | "unknown";
export type LeverageLabel = "low" | "normal" | "high" | "unknown";

export interface PriceFactorInput {
  changePercent: number | null;
  positionInRange: RangePosition;
  volatilityLabel: VolatilityLabel;
  dataQuality: DataQuality;
}

export interface PriceFactor extends PriceFactorInput {
  score: number;
  reasons: string[];
}

export interface NewsFactor {
  newsCount: number;
  sourceCount: number;
  latestHeadlineAt: string | null;
  recencyLabel: NewsRecencyLabel;
  activityLabel: NewsActivityLabel;
  headlines: Array<{
    headline: string;
    source: string | null;
    publishedAt: string;
  }>;
  score: number;
  reasons: string[];
}

export interface FundamentalFactor {
  valuationLabel: ValuationLabel;
  profitabilityLabel: ProfitabilityLabel;
  growthLabel: GrowthLabel;
  leverageLabel: LeverageLabel;
  metrics: Record<string, number>;
  score: number;
  reasons: string[];
}

export interface AttentionFactors {
  newsFactor?: NewsFactor;
  fundamentalFactor?: FundamentalFactor;
}

export interface AttentionFactorOptions {
  includeNewsFactors: boolean;
  includeFundamentalFactors: boolean;
  newsLookbackDays: number;
  maxNewsItemsPerSymbol: number;
  provider: string;
}

export class MarketAttentionFactorService {
  async buildFactorsForSymbols(
    symbolIds: string[],
    options: AttentionFactorOptions
  ): Promise<Map<string, AttentionFactors>> {
    const result = new Map<string, AttentionFactors>();
    const since = new Date(Date.now() - options.newsLookbackDays * 24 * 60 * 60 * 1000);

    for (const symbolId of symbolIds) {
      result.set(symbolId, {});
    }

    if (options.includeNewsFactors) {
      const newsRows = await prisma.companyNewsItem.findMany({
        where: {
          symbolId: {
            in: symbolIds
          },
          provider: options.provider,
          publishedAt: {
            gte: since
          }
        },
        orderBy: {
          publishedAt: "desc"
        }
      });
      const groupedNews = groupBySymbolId(newsRows);

      for (const symbolId of symbolIds) {
        const factors = result.get(symbolId) ?? {};
        factors.newsFactor = buildNewsFactor(
          groupedNews.get(symbolId) ?? [],
          options.maxNewsItemsPerSymbol
        );
        result.set(symbolId, factors);
      }
    }

    if (options.includeFundamentalFactors) {
      const financialRows = await prisma.companyBasicFinancial.findMany({
        where: {
          symbolId: {
            in: symbolIds
          },
          provider: options.provider
        }
      });
      const financialsBySymbol = new Map(financialRows.map((row) => [row.symbolId, row]));

      for (const symbolId of symbolIds) {
        const factors = result.get(symbolId) ?? {};
        factors.fundamentalFactor = buildFundamentalFactor(
          financialsBySymbol.get(symbolId)?.metricJson
        );
        result.set(symbolId, factors);
      }
    }

    return result;
  }
}

export function buildPriceFactor(input: PriceFactorInput): PriceFactor {
  const reasons: string[] = [];
  let score = 0;
  const absoluteChange = Math.abs(input.changePercent ?? 0);

  if (input.dataQuality === "too_few_snapshots") {
    return {
      ...input,
      score: 5,
      reasons: ["Snapshot count is below the minimum needed for a reliable daily read."]
    };
  }

  if (absoluteChange >= 5) {
    score += 24;
    reasons.push("Daily price movement is unusually large.");
  } else if (absoluteChange >= 3) {
    score += 18;
    reasons.push("Daily price movement is larger than normal.");
  } else if (absoluteChange >= 1.5) {
    score += 12;
    reasons.push("Daily price movement is noticeable.");
  }

  if (input.positionInRange === "near_high" || input.positionInRange === "near_low") {
    score += 10;
    reasons.push("Price is near an edge of the daily range.");
  }

  if (input.volatilityLabel === "extreme") {
    score += 16;
    reasons.push("Daily range is extremely wide relative to average price.");
  } else if (input.volatilityLabel === "high") {
    score += 10;
    reasons.push("Daily range is wide relative to average price.");
  }

  if (reasons.length === 0) {
    reasons.push("Price action is quiet from stored daily metrics.");
  }

  return {
    ...input,
    score: Math.min(score, 50),
    reasons
  };
}

function buildNewsFactor(
  newsRows: Array<{
    headline: string;
    source: string | null;
    publishedAt: Date;
  }>,
  maxNewsItemsPerSymbol: number
): NewsFactor {
  const sourceCount = new Set(newsRows.map((item) => item.source).filter(Boolean)).size;
  const latestPublishedAt = newsRows[0]?.publishedAt;
  const recencyLabel = getNewsRecencyLabel(latestPublishedAt);
  const activityLabel = getNewsActivityLabel(newsRows.length, sourceCount);
  const reasons: string[] = [];

  if (newsRows.length > 0) {
    reasons.push(`${newsRows.length} news item(s) appeared in the lookback window.`);
  } else {
    reasons.push("No stored company headlines appeared in the lookback window.");
  }

  if (recencyLabel === "fresh") {
    reasons.push("Latest headline is fresh enough to affect attention.");
  } else if (recencyLabel === "recent") {
    reasons.push("Latest headline is recent, but not urgent.");
  }

  if (sourceCount >= 2) {
    reasons.push("Headlines came from multiple sources.");
  }

  return {
    newsCount: newsRows.length,
    sourceCount,
    latestHeadlineAt: latestPublishedAt?.toISOString() ?? null,
    recencyLabel,
    activityLabel,
    headlines: newsRows.slice(0, maxNewsItemsPerSymbol).map((item) => ({
      headline: item.headline,
      source: item.source,
      publishedAt: item.publishedAt.toISOString()
    })),
    score: getNewsScore(newsRows.length, sourceCount, recencyLabel),
    reasons
  };
}

function buildFundamentalFactor(metricJson: unknown): FundamentalFactor {
  const metricRecord = isRecord(metricJson) ? metricJson : {};
  const metrics = pickNumericMetrics(metricRecord);
  const valuationLabel = getValuationLabel(metrics);
  const profitabilityLabel = getProfitabilityLabel(metrics);
  const growthLabel = getGrowthLabel(metrics);
  const leverageLabel = getLeverageLabel(metrics);
  const reasons: string[] = [];

  if (valuationLabel === "high" || valuationLabel === "extreme") {
    reasons.push("Valuation context is elevated.");
  } else if (valuationLabel === "low") {
    reasons.push("Valuation context screens low on selected metrics.");
  }

  if (profitabilityLabel === "strong") {
    reasons.push("Profitability metrics appear strong.");
  } else if (profitabilityLabel === "weak") {
    reasons.push("Profitability metrics appear weak.");
  }

  if (growthLabel === "strong" || growthLabel === "positive") {
    reasons.push("Growth metrics are positive.");
  } else if (growthLabel === "negative") {
    reasons.push("Growth metrics are negative.");
  }

  if (leverageLabel === "high") {
    reasons.push("Leverage context is elevated.");
  }

  if (Object.keys(metrics).length === 0) {
    reasons.push("No selected fundamental metrics are stored yet.");
  }

  return {
    valuationLabel,
    profitabilityLabel,
    growthLabel,
    leverageLabel,
    metrics,
    score: getFundamentalScore(valuationLabel, profitabilityLabel, growthLabel, leverageLabel),
    reasons
  };
}

function groupBySymbolId<T extends { symbolId: string }>(items: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();

  for (const item of items) {
    const current = result.get(item.symbolId) ?? [];
    current.push(item);
    result.set(item.symbolId, current);
  }

  return result;
}

function getNewsActivityLabel(newsCount: number, sourceCount: number): NewsActivityLabel {
  if (newsCount === 0) {
    return "quiet";
  }

  if (newsCount >= 5 || sourceCount >= 4) {
    return "very_active";
  }

  if (newsCount >= 3 || sourceCount >= 2) {
    return "active";
  }

  return "normal";
}

function getNewsRecencyLabel(latestPublishedAt: Date | undefined): NewsRecencyLabel {
  if (!latestPublishedAt) {
    return "none";
  }

  const ageHours = (Date.now() - latestPublishedAt.getTime()) / (60 * 60 * 1000);

  if (ageHours <= 12) {
    return "fresh";
  }

  if (ageHours <= 48) {
    return "recent";
  }

  return "stale";
}

function getNewsScore(
  newsCount: number,
  sourceCount: number,
  recencyLabel: NewsRecencyLabel
): number {
  let score = Math.min(newsCount * 5, 15) + Math.min(sourceCount * 3, 6);

  if (recencyLabel === "fresh") {
    score += 9;
  } else if (recencyLabel === "recent") {
    score += 5;
  }

  return Math.min(score, 30);
}

function pickNumericMetrics(metricRecord: Record<string, unknown>): Record<string, number> {
  const metricNames = [
    "peNormalizedAnnual",
    "peTTM",
    "forwardPE",
    "psAnnual",
    "pbAnnual",
    "grossMarginAnnual",
    "operatingMarginAnnual",
    "netProfitMarginAnnual",
    "revenueGrowthTTMYoy",
    "epsGrowthTTMYoy",
    "debtEquityAnnual",
    "52WeekHigh",
    "52WeekLow"
  ];

  return metricNames.reduce<Record<string, number>>((result, metricName) => {
    const value = metricRecord[metricName];
    const numberValue = Number(value);

    if (Number.isFinite(numberValue)) {
      result[metricName] = Number(numberValue.toFixed(4));
    }

    return result;
  }, {});
}

function getValuationLabel(metrics: Record<string, number>): ValuationLabel {
  const pe = metrics.peNormalizedAnnual ?? metrics.peTTM ?? metrics.forwardPE;
  const ps = metrics.psAnnual;

  if (pe === undefined && ps === undefined) {
    return "unknown";
  }

  if ((pe !== undefined && pe >= 80) || (ps !== undefined && ps >= 25)) {
    return "extreme";
  }

  if ((pe !== undefined && pe >= 35) || (ps !== undefined && ps >= 12)) {
    return "high";
  }

  if ((pe !== undefined && pe > 0 && pe <= 12) || (ps !== undefined && ps <= 2)) {
    return "low";
  }

  return "normal";
}

function getProfitabilityLabel(metrics: Record<string, number>): ProfitabilityLabel {
  const grossMargin = metrics.grossMarginAnnual;
  const operatingMargin = metrics.operatingMarginAnnual ?? metrics.netProfitMarginAnnual;

  if (grossMargin === undefined && operatingMargin === undefined) {
    return "unknown";
  }

  if ((grossMargin !== undefined && grossMargin >= 50) || (operatingMargin !== undefined && operatingMargin >= 20)) {
    return "strong";
  }

  if ((grossMargin !== undefined && grossMargin < 20) || (operatingMargin !== undefined && operatingMargin < 5)) {
    return "weak";
  }

  return "normal";
}

function getGrowthLabel(metrics: Record<string, number>): GrowthLabel {
  const growth = metrics.revenueGrowthTTMYoy ?? metrics.epsGrowthTTMYoy;

  if (growth === undefined) {
    return "unknown";
  }

  if (growth >= 20) {
    return "strong";
  }

  if (growth >= 3) {
    return "positive";
  }

  if (growth <= -3) {
    return "negative";
  }

  return "flat";
}

function getLeverageLabel(metrics: Record<string, number>): LeverageLabel {
  const debtEquity = metrics.debtEquityAnnual;

  if (debtEquity === undefined) {
    return "unknown";
  }

  if (debtEquity >= 2) {
    return "high";
  }

  if (debtEquity <= 0.5) {
    return "low";
  }

  return "normal";
}

function getFundamentalScore(
  valuationLabel: ValuationLabel,
  profitabilityLabel: ProfitabilityLabel,
  growthLabel: GrowthLabel,
  leverageLabel: LeverageLabel
): number {
  let score = 0;

  if (valuationLabel === "extreme") {
    score += 8;
  } else if (valuationLabel === "high" || valuationLabel === "low") {
    score += 5;
  }

  if (profitabilityLabel === "strong" || profitabilityLabel === "weak") {
    score += 5;
  }

  if (growthLabel === "strong" || growthLabel === "negative") {
    score += 5;
  } else if (growthLabel === "positive") {
    score += 3;
  }

  if (leverageLabel === "high") {
    score += 4;
  }

  return Math.min(score, 20);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
