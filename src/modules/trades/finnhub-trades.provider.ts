import type { TradeSubscription } from "../../types/trade.js";

export interface FinnhubTradesProviderOptions {
  apiKey: string;
}

export class FinnhubTradesProvider {
  private readonly websocketBaseUrl = "wss://ws.finnhub.io";

  constructor(private readonly options: FinnhubTradesProviderOptions) {}

  createWebSocketUrl(): string {
    if (!this.options.apiKey) {
      throw new Error("FINNHUB_API_KEY is required for Finnhub WebSocket Trades.");
    }

    const url = new URL(this.websocketBaseUrl);
    url.searchParams.set("token", this.options.apiKey);

    return url.toString();
  }

  createSubscription(symbols: string[]): TradeSubscription {
    return {
      symbols,
      source: "finnhub-websocket-trades"
    };
  }

  createSubscribeMessages(symbols: string[]): string[] {
    return symbols.map((symbol) =>
      JSON.stringify({
        type: "subscribe",
        symbol
      })
    );
  }
}
