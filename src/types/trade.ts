export interface TradeSubscription {
  symbols: string[];
  source: string;
}

export interface FinnhubTrade {
  symbol: string;
  price: number;
  volume: number;
  timestamp: Date;
}
