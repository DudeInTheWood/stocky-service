import "dotenv/config";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  notifyPriceUpdates: boolean;
  priceUpdateThrottleSeconds: number;
}

export interface PriceDropAlertConfig {
  enabled: boolean;
  defaultDropPercent: number;
  symbolDropPercents: Record<string, number>;
  cooldownSeconds: number;
  minDailySnapshots: number;
}

export interface FinnhubConfig {
  apiKey: string;
}

export interface MarketWindowConfig {
  start: string;
  end: string;
  snapshotIntervalSeconds: number;
}

export interface AppConfig {
  port: number;
  host: string;
  timezone: string;
  marketWindow: MarketWindowConfig;
  watchlistSymbols: string[];
  tradesProvider: "finnhub";
  finnhub: FinnhubConfig;
  telegram: TelegramConfig;
  priceDropAlert: PriceDropAlertConfig;
}

export function loadConfig(): AppConfig {
  return {
    port: parsePort(process.env.PORT),
    host: process.env.HOST ?? "127.0.0.1",
    timezone: process.env.APP_TIMEZONE ?? "Asia/Bangkok",
    marketWindow: {
      start: process.env.MARKET_WINDOW_START ?? "20:30",
      end: process.env.MARKET_WINDOW_END ?? "03:00",
      snapshotIntervalSeconds: parseSnapshotIntervalSeconds()
    },
    watchlistSymbols: splitCsv(process.env.WATCHLIST_SYMBOLS, [
      "BINANCE:BTCUSDT",
      "BINANCE:ETHUSDT",
      "NVDA",
      "SPCX",
      "GOOGL"
    ]),
    tradesProvider: "finnhub",
    finnhub: {
      apiKey: process.env.FINNHUB_API_KEY ?? ""
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      chatId: process.env.TELEGRAM_CHAT_ID ?? "",
      notifyPriceUpdates: parseBoolean(process.env.TELEGRAM_NOTIFY_PRICE_UPDATES, true),
      priceUpdateThrottleSeconds: parsePositiveInteger(
        process.env.TELEGRAM_PRICE_UPDATE_THROTTLE_SECONDS,
        900
      )
    },
    priceDropAlert: {
      enabled: parseBoolean(process.env.PRICE_DROP_ALERT_ENABLED, false),
      defaultDropPercent: parsePositiveNumber(process.env.PRICE_DROP_ALERT_DEFAULT_PERCENT, 3),
      symbolDropPercents: parseSymbolPercentMap(process.env.PRICE_DROP_ALERT_SYMBOL_PERCENTS),
      cooldownSeconds: parsePositiveInteger(process.env.PRICE_DROP_ALERT_COOLDOWN_SECONDS, 900),
      minDailySnapshots: parsePositiveInteger(process.env.PRICE_DROP_ALERT_MIN_DAILY_SNAPSHOTS, 5)
    }
  };
}

function splitCsv(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePort(value: string | undefined): number {
  const port = Number(value);

  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }

  return 3000;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function parseSymbolPercentMap(value: string | undefined): Record<string, number> {
  if (!value) {
    return {};
  }

  return value.split(",").reduce<Record<string, number>>((result, item) => {
    const separatorIndex = item.lastIndexOf(":");

    if (separatorIndex <= 0) {
      return result;
    }

    const normalizedSymbol = item.slice(0, separatorIndex).trim();
    const percent = parsePositiveNumber(item.slice(separatorIndex + 1).trim(), 0);

    if (normalizedSymbol && percent > 0) {
      result[normalizedSymbol] = percent;
    }

    return result;
  }, {});
}

function parseSnapshotIntervalSeconds(): number {
  const seconds = parsePositiveInteger(process.env.PRICE_SNAPSHOT_INTERVAL_SECONDS, 0);

  if (seconds > 0) {
    return seconds;
  }

  return parsePositiveInteger(process.env.PRICE_SNAPSHOT_INTERVAL_MINUTES, 15) * 60;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
