import type { AppConfig } from "./config/app-config.js";
import { PriceSnapshotService } from "./modules/prices/price-snapshot.service.js";
import { DailyPriceMetricService } from "./modules/prices/daily-price-metric.service.js";
import { DailyPriceMetricCache } from "./modules/prices/daily-price-metric-cache.js";
import { DailyPriceUpdateContextProvider } from "./modules/prices/daily-price-update-context.provider.js";
import { AlertRuleService } from "./modules/alerts/alert-rule.service.js";
import { PriceDropAlertService } from "./modules/alerts/price-drop-alert.service.js";
import { TelegramNotificationProvider } from "./modules/notifications/telegram-notification.provider.js";
import { StockFetchJob } from "./jobs/stock-fetch.job.js";
import { StockFetchScheduler } from "./scheduler/stock-fetch.scheduler.js";
import { HttpApiServer } from "./api/http-api.server.js";
import { FinnhubTradesProvider } from "./modules/trades/finnhub-trades.provider.js";
import { FinnhubTradeStreamService } from "./modules/trades/finnhub-trade-stream.service.js";

export interface App {
  start(): Promise<void>;
}

export function createApp(config: AppConfig): App {
  const tradesProvider = new FinnhubTradesProvider(config.finnhub);
  const priceUpdateContextProvider = new DailyPriceUpdateContextProvider(config.timezone);
  const notificationProvider = new TelegramNotificationProvider(
    config.telegram,
    priceUpdateContextProvider
  );
  const dailyPriceMetricCache = new DailyPriceMetricCache();
  const priceDropAlertService = new PriceDropAlertService(
    config.priceDropAlert,
    dailyPriceMetricCache,
    notificationProvider
  );
  const tradeStreamService = new FinnhubTradeStreamService({
    symbols: config.watchlistSymbols,
    provider: tradesProvider,
    notificationProvider,
    priceDropAlertService,
    notifyPriceUpdates: config.telegram.notifyPriceUpdates,
    priceUpdateThrottleSeconds: config.telegram.priceUpdateThrottleSeconds
  });
  const dailyPriceMetricService = new DailyPriceMetricService(config.timezone, dailyPriceMetricCache);
  const priceSnapshotService = new PriceSnapshotService(dailyPriceMetricService);
  const alertRuleService = new AlertRuleService();

  const stockFetchJob = new StockFetchJob({
    watchlistSymbols: config.watchlistSymbols,
    snapshotIntervalSeconds: config.marketWindow.snapshotIntervalSeconds,
    tradeStreamService,
    priceSnapshotService,
    alertRuleService,
    notificationProvider
  });

  const scheduler = new StockFetchScheduler({
    timezone: config.timezone,
    marketWindow: config.marketWindow,
    job: stockFetchJob,
    tradeStreamService
  });
  const apiServer = new HttpApiServer({
    port: config.port,
    host: config.host,
    watchlistSymbols: config.watchlistSymbols,
    tradesProvider
  });

  return {
    async start(): Promise<void> {
      await notificationProvider.notifyStartup();
      scheduler.start();
      await apiServer.start();
    }
  };
}
