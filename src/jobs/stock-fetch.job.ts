import type { AlertRuleService } from "../modules/alerts/alert-rule.service.js";
import type { NotificationProvider } from "../modules/notifications/notification.provider.js";
import type { PriceSnapshotService } from "../modules/prices/price-snapshot.service.js";
import type { FinnhubTradeStreamService } from "../modules/trades/finnhub-trade-stream.service.js";

export interface StockFetchJobDependencies {
  watchlistSymbols: string[];
  snapshotIntervalSeconds: number;
  tradeStreamService: FinnhubTradeStreamService;
  priceSnapshotService: PriceSnapshotService;
  alertRuleService: AlertRuleService;
  notificationProvider: NotificationProvider;
}

export class StockFetchJob {
  constructor(private readonly dependencies: StockFetchJobDependencies) {}

  async run(): Promise<void> {
    const snapshottedAt = new Date();
    const quotes = this.dependencies.tradeStreamService.getSnapshotEligibleQuotes(
      this.dependencies.snapshotIntervalSeconds,
      snapshottedAt
    );

    if (quotes.length === 0) {
      console.log("No trade prices are eligible for this snapshot tick.");
      return;
    }

    const storedCount = await this.dependencies.priceSnapshotService.storeQuotes(quotes);
    this.dependencies.tradeStreamService.markQuotesSnapshotted(quotes, snapshottedAt);
    console.log(`Stored ${storedCount} price snapshot(s).`);

    void this.dependencies.watchlistSymbols;
    void this.dependencies.alertRuleService;
    void this.dependencies.notificationProvider;
  }
}
