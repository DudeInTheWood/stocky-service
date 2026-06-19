import type { Quote } from "../../types/quote.js";
import type { FinnhubTrade } from "../../types/trade.js";
import type { PriceDropAlertService } from "../alerts/price-drop-alert.service.js";
import type { TelegramNotificationProvider } from "../notifications/telegram-notification.provider.js";
import type { FinnhubTradesProvider } from "./finnhub-trades.provider.js";

interface FinnhubTradeMessage {
  type: string;
  data?: Array<{
    s: string;
    p: number;
    v: number;
    t: number;
  }>;
}

interface LatestTradeEntry {
  trade: FinnhubTrade;
  receivedAt: Date;
}

export interface FinnhubTradeStreamServiceOptions {
  symbols: string[];
  provider: FinnhubTradesProvider;
  notificationProvider?: TelegramNotificationProvider;
  priceDropAlertService?: PriceDropAlertService;
  notifyPriceUpdates: boolean;
  priceUpdateThrottleSeconds: number;
}

export class FinnhubTradeStreamService {
  private socket: WebSocket | null = null;
  private readonly latestTrades = new Map<string, LatestTradeEntry>();
  private readonly lastSnapshotTimes = new Map<string, number>();
  private readonly lastNotificationTimes = new Map<string, number>();

  constructor(private readonly options: FinnhubTradeStreamServiceOptions) {}

  start(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    const socket = new WebSocket(this.options.provider.createWebSocketUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      for (const message of this.options.provider.createSubscribeMessages(this.options.symbols)) {
        socket.send(message);
      }

      console.log(
        `Finnhub trade stream subscribed to ${this.options.symbols.length} symbol(s).`
      );
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener("error", () => {
      console.error("Finnhub trade stream encountered a WebSocket error.");
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      console.log("Finnhub trade stream closed.");
    });
  }

  stop(): void {
    if (!this.socket) {
      return;
    }

    if (this.socket.readyState === WebSocket.OPEN) {
      for (const symbol of this.options.symbols) {
        this.socket.send(
          JSON.stringify({
            type: "unsubscribe",
            symbol
          })
        );
      }
    }

    this.socket.close();
    this.socket = null;
  }

  isRunning(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  getSnapshotEligibleQuotes(snapshotIntervalSeconds: number, now = new Date()): Quote[] {
    const snapshotIntervalMs = snapshotIntervalSeconds * 1000;
    const nowTime = now.getTime();

    return Array.from(this.latestTrades.values())
      .filter((entry) => {
        const lastSnapshotTime = this.lastSnapshotTimes.get(entry.trade.symbol) ?? 0;

        return (
          entry.receivedAt.getTime() - lastSnapshotTime >= snapshotIntervalMs &&
          nowTime - lastSnapshotTime >= snapshotIntervalMs
        );
      })
      .map((entry) => toQuote(entry.trade));
  }

  markQuotesSnapshotted(quotes: Quote[], snapshottedAt = new Date()): void {
    const snapshottedAtTime = snapshottedAt.getTime();

    for (const quote of quotes) {
      this.lastSnapshotTimes.set(quote.symbol, snapshottedAtTime);
    }
  }

  private handleMessage(data: unknown): void {
    const message = parseMessage(data);

    if (message?.type !== "trade" || !message.data) {
      return;
    }

    for (const trade of message.data) {
      const latestTrade = {
        symbol: trade.s,
        price: trade.p,
        volume: trade.v,
        timestamp: new Date(trade.t)
      };

      this.latestTrades.set(trade.s, {
        trade: latestTrade,
        receivedAt: new Date()
      });
      void this.options.priceDropAlertService?.evaluate(toQuote(latestTrade));
      void this.notifyTrade(latestTrade);
    }
  }

  private async notifyTrade(trade: FinnhubTrade): Promise<void> {
    if (!this.options.notifyPriceUpdates || !this.options.notificationProvider) {
      return;
    }

    const now = Date.now();
    const lastNotificationTime = this.lastNotificationTimes.get(trade.symbol) ?? 0;
    const throttleMs = this.options.priceUpdateThrottleSeconds * 1000;

    if (now - lastNotificationTime < throttleMs) {
      return;
    }

    this.lastNotificationTimes.set(trade.symbol, now);

    try {
      await this.options.notificationProvider.notifyPriceUpdate({
        ...toQuote(trade)
      });
      console.log(`Sent Telegram price update for ${trade.symbol}.`);
    } catch (error) {
      console.error("Failed to send Telegram price update.", error);
    }
  }
}

function toQuote(trade: FinnhubTrade): Quote {
  return {
    symbol: trade.symbol,
    price: trade.price,
    currency: inferCurrency(trade.symbol),
    marketTimestamp: trade.timestamp,
    source: "finnhub-websocket-trades"
  };
}

function parseMessage(data: unknown): FinnhubTradeMessage | null {
  try {
    return JSON.parse(String(data)) as FinnhubTradeMessage;
  } catch {
    return null;
  }
}

function inferCurrency(symbol: string): string {
  if (symbol.endsWith("USDT")) {
    return "USDT";
  }

  return "USD";
}
