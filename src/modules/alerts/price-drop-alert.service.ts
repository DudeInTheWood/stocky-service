import type { PriceDropAlertConfig } from "../../config/app-config.js";
import type { Quote } from "../../types/quote.js";
import type { PriceDropAlertNotification } from "../../types/price-drop-alert.js";
import type { TelegramNotificationProvider } from "../notifications/telegram-notification.provider.js";
import type { DailyPriceMetricCache } from "../prices/daily-price-metric-cache.js";

export class PriceDropAlertService {
  private readonly lastAlertTimes = new Map<string, number>();

  constructor(
    private readonly config: PriceDropAlertConfig,
    private readonly dailyPriceMetricCache: DailyPriceMetricCache,
    private readonly notificationProvider: TelegramNotificationProvider
  ) {}

  async evaluate(quote: Quote): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const metric = this.dailyPriceMetricCache.get(quote.symbol);

    if (!metric || metric.snapshotCount < this.config.minDailySnapshots) {
      return;
    }

    const thresholdPercent = this.getThresholdPercent(quote.symbol);
    const alertPrice = metric.lowPrice * (1 - thresholdPercent / 100);

    if (quote.price > alertPrice || !this.canAlert(quote.symbol)) {
      return;
    }

    this.markAlerted(quote.symbol);

    try {
      await this.notificationProvider.notifyPriceDropAlert({
        symbol: quote.symbol,
        currentPrice: quote.price,
        dailyLowPrice: metric.lowPrice,
        dropPercent: ((metric.lowPrice - quote.price) / metric.lowPrice) * 100,
        thresholdPercent,
        snapshotCount: metric.snapshotCount,
        currency: quote.currency,
        marketTimestamp: quote.marketTimestamp
      });
      console.log(`Sent Telegram price drop alert for ${quote.symbol}.`);
    } catch (error) {
      console.error("Failed to send Telegram price drop alert.", error);
    }
  }

  private getThresholdPercent(symbol: string): number {
    return this.config.symbolDropPercents[symbol] ?? this.config.defaultDropPercent;
  }

  private canAlert(symbol: string): boolean {
    const lastAlertTime = this.lastAlertTimes.get(symbol) ?? 0;

    return Date.now() - lastAlertTime >= this.config.cooldownSeconds * 1000;
  }

  private markAlerted(symbol: string): void {
    this.lastAlertTimes.set(symbol, Date.now());
  }
}
