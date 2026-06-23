import { prisma } from "../../db/prisma.js";
import {
  buildPriceFactor,
  type FundamentalFactor,
  type NewsFactor,
  type PriceFactor,
  type MarketAttentionFactorService
} from "../market-context/market-attention-factor.service.js";

export type RangePosition = "near_low" | "middle" | "near_high" | "flat";
export type VolatilityLabel = "low" | "medium" | "high" | "extreme";
export type DataQuality = "ok" | "too_few_snapshots";

export interface AnalysisSymbolInput {
  symbolId: string;
  ticker: string;
  date: string;
  latestPrice: number;
  previousClose: number | null;
  dailyHigh: number;
  dailyLow: number;
  dailyAverage: number;
  rangePercent: number;
  changePercent: number | null;
  snapshotCount: number;
  positionInRange: RangePosition;
  volatilityLabel: VolatilityLabel;
  dataQuality: DataQuality;
  priceFactor: PriceFactor;
  newsFactor?: NewsFactor;
  fundamentalFactor?: FundamentalFactor;
  attentionScore: number;
  attentionReasons: string[];
}

export interface AnalysisInput {
  reportType: "pre_market_attention";
  timeframe: "1d";
  timezone: string;
  generatedAt: string;
  minDailySnapshots: number;
  symbols: AnalysisSymbolInput[];
}

export interface AnalysisInputServiceOptions {
  timezone: string;
  watchlistSymbols: string[];
  minDailySnapshots: number;
  maxSymbolsInReport: number;
  includeNewsFactors: boolean;
  includeFundamentalFactors: boolean;
  newsLookbackDays: number;
  maxNewsItemsPerSymbol: number;
  marketContextProvider: string;
  attentionFactorService?: MarketAttentionFactorService;
}

export class AnalysisInputService {
  constructor(private readonly options: AnalysisInputServiceOptions) {}

  async buildPreMarketDailyInput(): Promise<AnalysisInput> {
    const symbolRows = await prisma.symbol.findMany({
      where: {
        ticker: {
          in: this.options.watchlistSymbols
        },
        enabled: true
      },
      include: {
        dailyPriceMetrics: {
          orderBy: {
            date: "desc"
          },
          take: 1
        }
      }
    });

    const symbolOrder = new Map(
      this.options.watchlistSymbols.map((ticker, index) => [ticker, index] as const)
    );

    const symbolInputs = symbolRows
      .sort((left, right) => {
        return (symbolOrder.get(left.ticker) ?? 0) - (symbolOrder.get(right.ticker) ?? 0);
      })
      .flatMap<AnalysisSymbolInput>((symbol) => {
        const metric = symbol.dailyPriceMetrics[0];

        if (!metric) {
          return [];
        }

        const latestPrice = Number(metric.closePrice);
        const dailyHigh = Number(metric.highPrice);
        const dailyLow = Number(metric.lowPrice);
        const dailyAverage = Number(metric.avgPrice);
        const previousClose = metric.previousClose === null ? null : Number(metric.previousClose);
        const positionInRange = getPositionInRange(latestPrice, dailyLow, dailyHigh);
        const volatilityLabel = getVolatilityLabel(dailyLow, dailyHigh, dailyAverage);
        const dataQuality =
          metric.snapshotCount >= this.options.minDailySnapshots ? "ok" : "too_few_snapshots";
        const priceFactor = buildPriceFactor({
          changePercent: metric.changePercent === null ? null : Number(metric.changePercent),
          positionInRange,
          volatilityLabel,
          dataQuality
        });

        return [
          {
            symbolId: symbol.id,
            ticker: symbol.ticker,
            date: metric.date.toISOString().slice(0, 10),
            latestPrice,
            previousClose,
            dailyHigh,
            dailyLow,
            dailyAverage,
            rangePercent: getRangePercent(dailyLow, dailyHigh, dailyAverage),
            changePercent: metric.changePercent === null ? null : Number(metric.changePercent),
            snapshotCount: metric.snapshotCount,
            positionInRange,
            volatilityLabel,
            dataQuality,
            priceFactor,
            attentionScore: priceFactor.score,
            attentionReasons: priceFactor.reasons
          }
        ];
      })
      .slice(0, this.options.maxSymbolsInReport);
    const factorsBySymbolId = await this.options.attentionFactorService?.buildFactorsForSymbols(
      symbolInputs.map((symbol) => symbol.symbolId),
      {
        includeNewsFactors: this.options.includeNewsFactors,
        includeFundamentalFactors: this.options.includeFundamentalFactors,
        newsLookbackDays: this.options.newsLookbackDays,
        maxNewsItemsPerSymbol: this.options.maxNewsItemsPerSymbol,
        provider: this.options.marketContextProvider
      }
    );
    const symbols = symbolInputs.map((symbol) => {
      const factors = factorsBySymbolId?.get(symbol.symbolId);
      const attentionScore =
        symbol.priceFactor.score +
        (factors?.newsFactor?.score ?? 0) +
        (factors?.fundamentalFactor?.score ?? 0);

      return {
        ...symbol,
        newsFactor: factors?.newsFactor,
        fundamentalFactor: factors?.fundamentalFactor,
        attentionScore: Math.min(attentionScore, 100),
        attentionReasons: [
          ...symbol.priceFactor.reasons,
          ...(factors?.newsFactor?.reasons ?? []),
          ...(factors?.fundamentalFactor?.reasons ?? [])
        ]
      };
    });

    return {
      reportType: "pre_market_attention",
      timeframe: "1d",
      timezone: this.options.timezone,
      generatedAt: new Date().toISOString(),
      minDailySnapshots: this.options.minDailySnapshots,
      symbols
    };
  }
}

export function getPositionInRange(price: number, low: number, high: number): RangePosition {
  const range = high - low;

  if (range <= 0) {
    return "flat";
  }

  const position = (price - low) / range;

  if (position <= 0.25) {
    return "near_low";
  }

  if (position >= 0.75) {
    return "near_high";
  }

  return "middle";
}

export function getVolatilityLabel(low: number, high: number, average: number): VolatilityLabel {
  const rangePercent = getRangePercent(low, high, average);

  if (rangePercent < 1) {
    return "low";
  }

  if (rangePercent < 3) {
    return "medium";
  }

  if (rangePercent < 7) {
    return "high";
  }

  return "extreme";
}

export function getRangePercent(low: number, high: number, average: number): number {
  if (average <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Number((((high - low) / average) * 100).toFixed(4));
}
