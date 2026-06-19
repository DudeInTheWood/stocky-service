import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

interface AppJsonConfig {
  server?: {
    port?: unknown;
    host?: unknown;
  };
  timezone?: unknown;
  marketWindow?: {
    start?: unknown;
    end?: unknown;
  };
  snapshotIntervalSeconds?: unknown;
  watchlistSymbols?: unknown;
  tradesProvider?: unknown;
  telegram?: {
    notifyPriceUpdates?: unknown;
    priceUpdateThrottleSeconds?: unknown;
  };
  priceDropAlert?: {
    enabled?: unknown;
    defaultDropPercent?: unknown;
    symbolDropPercents?: unknown;
    cooldownSeconds?: unknown;
    minDailySnapshots?: unknown;
  };
}

const DEFAULT_CONFIG_FILE = "config/app.json";

export function loadConfig(): AppConfig {
  const jsonConfig = loadJsonConfig();

  return {
    port: parsePort(jsonConfig.server?.port, 3000),
    host: parseString(jsonConfig.server?.host, "127.0.0.1"),
    timezone: parseString(jsonConfig.timezone, "Asia/Bangkok"),
    marketWindow: {
      start: parseString(jsonConfig.marketWindow?.start, "20:30"),
      end: parseString(jsonConfig.marketWindow?.end, "03:00"),
      snapshotIntervalSeconds: parsePositiveInteger(jsonConfig.snapshotIntervalSeconds, 900)
    },
    watchlistSymbols: parseStringArray(jsonConfig.watchlistSymbols, [
      "BINANCE:BTCUSDT",
      "BINANCE:ETHUSDT",
      "NVDA",
      "SPCX",
      "GOOGL",
      "AVGO",
      "FLNC",
      "INTC"
    ]),
    tradesProvider: parseTradesProvider(jsonConfig.tradesProvider),
    finnhub: {
      apiKey: process.env.FINNHUB_API_KEY ?? ""
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      chatId: process.env.TELEGRAM_CHAT_ID ?? "",
      notifyPriceUpdates: parseBoolean(jsonConfig.telegram?.notifyPriceUpdates, true),
      priceUpdateThrottleSeconds: parsePositiveInteger(
        jsonConfig.telegram?.priceUpdateThrottleSeconds,
        900
      )
    },
    priceDropAlert: {
      enabled: parseBoolean(jsonConfig.priceDropAlert?.enabled, false),
      defaultDropPercent: parsePositiveNumber(jsonConfig.priceDropAlert?.defaultDropPercent, 3),
      symbolDropPercents: parseSymbolPercentMap(jsonConfig.priceDropAlert?.symbolDropPercents),
      cooldownSeconds: parsePositiveInteger(jsonConfig.priceDropAlert?.cooldownSeconds, 900),
      minDailySnapshots: parsePositiveInteger(jsonConfig.priceDropAlert?.minDailySnapshots, 5)
    }
  };
}

function loadJsonConfig(): AppJsonConfig {
  const configPath = resolve(process.cwd(), process.env.CONFIG_FILE ?? DEFAULT_CONFIG_FILE);

  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as AppJsonConfig;
  } catch (error) {
    throw new Error(`Failed to load app config from ${configPath}: ${String(error)}`);
  }
}

function parseString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function parseStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );

  return items.length > 0 ? items.map((item) => item.trim()) : fallback;
}

function parsePort(value: unknown, fallback: number): number {
  const port = Number(value);

  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }

  return fallback;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function parseTradesProvider(value: unknown): "finnhub" {
  if (value === "finnhub" || value === undefined) {
    return "finnhub";
  }

  throw new Error(`Unsupported trades provider "${String(value)}".`);
}

function parseSymbolPercentMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((result, [symbol, percent]) => {
    const parsedPercent = parsePositiveNumber(percent, 0);

    if (symbol.trim() && parsedPercent > 0) {
      result[symbol.trim()] = parsedPercent;
    }

    return result;
  }, {});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
