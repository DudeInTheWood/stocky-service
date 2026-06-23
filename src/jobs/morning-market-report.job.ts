import { prisma } from "../db/prisma.js";
import {
  getPositionInRange,
  getRangePercent,
  getVolatilityLabel
} from "../modules/analysis/analysis-input.service.js";
import type { AiAnalysisReportService } from "../modules/analysis/ai-analysis-report.service.js";
import {
  buildPriceFactor,
  type FundamentalFactor,
  type MarketAttentionFactorService,
  type NewsFactor,
  type PriceFactor
} from "../modules/market-context/market-attention-factor.service.js";
import type { MessageNotificationProvider } from "../modules/notifications/message-notification.provider.js";
import { addDays, getDateOnlyInTimezone } from "../utils/timezone-date.js";
import type { MarketContextRefreshJob } from "./market-context-refresh.job.js";

export interface MorningMarketReportConfig {
  reportTimes: string[];
  timezone: string;
  newsLookbackDays: number;
  maxNewsItemsPerSymbol: number;
  refreshMarketContextBeforeRun: boolean;
  notifyDiscord: boolean;
}

export interface MorningMarketReportJobDependencies {
  config: MorningMarketReportConfig;
  watchlistSymbols: string[];
  marketContextProvider: string;
  attentionFactorService: MarketAttentionFactorService;
  reportService: AiAnalysisReportService;
  marketContextRefreshJob?: MarketContextRefreshJob;
  notificationProviders?: MessageNotificationProvider[];
}

interface MorningSymbolReport {
  symbolId: string;
  ticker: string;
  targetDate: string;
  metricDate: string | null;
  latestPrice: number | null;
  previousClose: number | null;
  changePercent: number | null;
  dailyHigh: number | null;
  dailyLow: number | null;
  dailyAverage: number | null;
  rangePercent: number | null;
  snapshotCount: number;
  priceFactor: PriceFactor | null;
  newsFactor?: NewsFactor;
  fundamentalFactor?: FundamentalFactor;
  nextSessionRead: string;
}

export class MorningMarketReportJob {
  constructor(private readonly dependencies: MorningMarketReportJobDependencies) {}

  async run(reportTime = this.dependencies.config.reportTimes[0] ?? "10:00"): Promise<void> {
    if (this.dependencies.config.refreshMarketContextBeforeRun) {
      await this.dependencies.marketContextRefreshJob?.run();
    }

    const reports = await this.buildReports();

    for (const report of reports) {
      const message = formatMorningDiscordMessage(report, reportTime);

      await this.dependencies.reportService.saveReport({
        symbolId: report.symbolId,
        ticker: report.ticker,
        reportType: "morning_market_summary",
        timeframe: "1d",
        inputJson: report,
        outputJson: {
          message
        },
        title: `Morning Market Summary: ${report.ticker}`,
        summary: message,
        category: null,
        riskLevel: null,
        confidence: null
      });

      if (this.dependencies.config.notifyDiscord) {
        await this.notifyReport(message);
      }
    }

    console.log(`Morning market report completed for ${reports.length} symbol(s).`);
  }

  private async buildReports(): Promise<MorningSymbolReport[]> {
    const today = getDateOnlyInTimezone(new Date(), this.dependencies.config.timezone);
    const targetDate = addDays(today, -1);
    const symbolRows = await prisma.symbol.findMany({
      where: {
        ticker: {
          in: this.dependencies.watchlistSymbols
        },
        enabled: true
      },
      include: {
        dailyPriceMetrics: {
          where: {
            date: {
              lt: today
            }
          },
          orderBy: {
            date: "desc"
          },
          take: 1
        }
      }
    });
    const symbolOrder = new Map(
      this.dependencies.watchlistSymbols.map((ticker, index) => [ticker, index] as const)
    );
    const factorsBySymbolId = await this.dependencies.attentionFactorService.buildFactorsForSymbols(
      symbolRows.map((symbol) => symbol.id),
      {
        includeNewsFactors: true,
        includeFundamentalFactors: true,
        newsLookbackDays: this.dependencies.config.newsLookbackDays,
        maxNewsItemsPerSymbol: this.dependencies.config.maxNewsItemsPerSymbol,
        provider: this.dependencies.marketContextProvider
      }
    );

    return symbolRows
      .sort((left, right) => {
        return (symbolOrder.get(left.ticker) ?? 0) - (symbolOrder.get(right.ticker) ?? 0);
      })
      .map((symbol) => {
        const metric = symbol.dailyPriceMetrics[0];
        const factors = factorsBySymbolId.get(symbol.id);

        if (!metric) {
          return {
            symbolId: symbol.id,
            ticker: symbol.ticker,
            targetDate: toDateString(targetDate),
            metricDate: null,
            latestPrice: null,
            previousClose: null,
            changePercent: null,
            dailyHigh: null,
            dailyLow: null,
            dailyAverage: null,
            rangePercent: null,
            snapshotCount: 0,
            priceFactor: null,
            newsFactor: factors?.newsFactor,
            fundamentalFactor: factors?.fundamentalFactor,
            nextSessionRead: "No completed price read yet; wait for today's first real movement before reading the setup."
          };
        }

        const latestPrice = Number(metric.closePrice);
        const dailyHigh = Number(metric.highPrice);
        const dailyLow = Number(metric.lowPrice);
        const dailyAverage = Number(metric.avgPrice);
        const changePercent = metric.changePercent === null ? null : Number(metric.changePercent);
        const priceFactor = buildPriceFactor({
          changePercent,
          positionInRange: getPositionInRange(latestPrice, dailyLow, dailyHigh),
          volatilityLabel: getVolatilityLabel(dailyLow, dailyHigh, dailyAverage),
          dataQuality:
            metric.snapshotCount >= 5 ? "ok" : "too_few_snapshots"
        });
        const report = {
          symbolId: symbol.id,
          ticker: symbol.ticker,
          targetDate: toDateString(targetDate),
          metricDate: toDateString(metric.date),
          latestPrice,
          previousClose: metric.previousClose === null ? null : Number(metric.previousClose),
          changePercent,
          dailyHigh,
          dailyLow,
          dailyAverage,
          rangePercent: getRangePercent(dailyLow, dailyHigh, dailyAverage),
          snapshotCount: metric.snapshotCount,
          priceFactor,
          newsFactor: factors?.newsFactor,
          fundamentalFactor: factors?.fundamentalFactor,
          nextSessionRead: ""
        };

        return {
          ...report,
          nextSessionRead: createNextSessionRead(report)
        };
      });
  }

  private async notifyReport(message: string): Promise<void> {
    if (!this.dependencies.notificationProviders?.length) {
      return;
    }

    await Promise.all(
      this.dependencies.notificationProviders.map((provider) => provider.notifyMessage(message))
    );
  }
}

function formatMorningDiscordMessage(report: MorningSymbolReport, reportTime: string): string {
  return [
    `## 🌅 ${report.ticker}`,
    `**Morning read** · ${reportTime} GMT+7 · price date ${report.metricDate ?? "none"}`,
    "",
    formatPriceRecap(report),
    formatSignalRecap(report),
    formatNewsRecap(report.newsFactor),
    formatFundamentalRecap(report.fundamentalFactor),
    `🔮 **Rough read:** ${report.nextSessionRead}`
  ].join("\n");
}

function formatPriceRecap(report: MorningSymbolReport): string {
  if (!report.priceFactor || report.latestPrice === null) {
    return "📈 **Last night:** no completed daily price metric yet.";
  }

  return `📈 **Last night:** closed ${formatNumber(report.latestPrice)} (${formatPercent(report.changePercent)}), range ${formatNumber(report.dailyLow)}-${formatNumber(report.dailyHigh)}.`;
}

function formatSignalRecap(report: MorningSymbolReport): string {
  if (!report.priceFactor) {
    return "⚡ **Signal:** price signal unavailable.";
  }

  return `⚡ **Signal:** ${report.priceFactor.volatilityLabel} volatility, ${report.priceFactor.positionInRange}, ${formatPercent(report.rangePercent)} intraday range, ${report.snapshotCount} snapshots.`;
}

function formatNewsRecap(newsFactor: NewsFactor | undefined): string {
  if (!newsFactor || newsFactor.newsCount === 0) {
    return "📰 **News:** quiet; no fresh stored headline pushing attention.";
  }

  const headline = newsFactor.headlines[0];
  const headlineText = headline ? ` — **${headline.headline}**` : "";

  return `📰 **News:** ${newsFactor.activityLabel}, ${newsFactor.recencyLabel}, ${newsFactor.newsCount} item(s)${headlineText}`;
}

function formatFundamentalRecap(fundamentalFactor: FundamentalFactor | undefined): string {
  if (!fundamentalFactor) {
    return "🏦 **Company:** no current financial metrics stored.";
  }

  return `🏦 **Company:** valuation ${fundamentalFactor.valuationLabel}, profitability ${fundamentalFactor.profitabilityLabel}, growth ${fundamentalFactor.growthLabel}, leverage ${fundamentalFactor.leverageLabel}.`;
}

function createNextSessionRead(report: {
  ticker?: string;
  latestPrice?: number | null;
  dailyHigh?: number | null;
  dailyLow?: number | null;
  changePercent: number | null;
  priceFactor: PriceFactor;
  newsFactor?: NewsFactor;
  fundamentalFactor?: FundamentalFactor;
}): string {
  const changePercent = report.changePercent ?? 0;
  const headline = report.newsFactor?.headlines[0]?.headline;
  const hasFreshNews =
    report.newsFactor?.recencyLabel === "fresh" || report.newsFactor?.recencyLabel === "recent";
  const closeText = report.latestPrice === undefined ? "the close" : formatNumber(report.latestPrice);
  const rangeText =
    report.dailyLow === undefined || report.dailyHigh === undefined
      ? "the daily range"
      : `${formatNumber(report.dailyLow)}-${formatNumber(report.dailyHigh)}`;
  const newsText = headline ? ` The headline to keep in mind is "${headline}".` : "";
  const valuationText =
    report.fundamentalFactor?.valuationLabel === "high" ||
    report.fundamentalFactor?.valuationLabel === "extreme"
      ? " Valuation is not cheap here, so reactions can be sharper than the tape first suggests."
      : "";

  if (report.priceFactor.dataQuality !== "ok") {
    return `The price sample is thin, so I would treat last night's read as incomplete. Let today's first real move set the tone before reading too much into ${closeText}.${newsText}`;
  }

  if (report.priceFactor.volatilityLabel === "extreme") {
    return `Last night was not a clean tape; the range was wide at ${rangeText}, so today can stay jumpy. I would care more about whether price calms down and holds a side of the range than the first spike.${newsText}${valuationText}`;
  }

  if (changePercent >= 2 && report.priceFactor.positionInRange === "near_high") {
    return hasFreshNews
      ? `Buyers had control into the close near ${closeText}, and the news flow gives the move a real reason to stay on the board.${newsText} If it holds the upper part of ${rangeText}, attention probably stays warm; if it slips back inside the range, it becomes more of a fade/check story.`
      : `Buyers had control into the close near ${closeText}, but there is not much fresh news behind it. I would read today as a follow-through test: hold near the upper range and it stays interesting, lose that area and last night's strength looks less convincing.`;
  }

  if (changePercent <= -2 && report.priceFactor.positionInRange === "near_low") {
    return hasFreshNews
      ? `Sellers had the stronger hand last night, and fresh news keeps the pressure relevant instead of random.${newsText} Today needs a reclaim toward the middle of ${rangeText}; without that, the name can keep trading heavy.`
      : `Last night closed weak near ${closeText}, but without fresh news it feels more like a pressure check than a full story. Today needs stabilization first; otherwise the lower side of ${rangeText} stays the magnet.`;
  }

  if (hasFreshNews) {
    return `The price action by itself was not loud, but the news flow makes this one less sleepy than the chart says.${newsText} If volume shows up today, the headline can pull attention quickly; if price stays inside yesterday's range, it is probably just digestion.`;
  }

  if (report.fundamentalFactor?.valuationLabel === "high" || report.fundamentalFactor?.valuationLabel === "extreme") {
    return `Last night looked more like normal positioning than a strong signal. The company context is valuation-sensitive, though, so any fresh catalyst today can get exaggerated fast; without one, I would expect more range work around ${closeText}.`;
  }

  return `Last night did not force a big conclusion. I would treat today as a confirmation day: a break outside ${rangeText} makes it worth paying attention, while another inside-range session keeps it low drama.`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${formatNumber(value)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 4
  });
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
