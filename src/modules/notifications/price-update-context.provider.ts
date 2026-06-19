import type { Quote } from "../../types/quote.js";

export interface PriceUpdateContext {
  dailyHighPrice: number;
  dailyLowPrice: number;
  snapshotCount: number;
}

export interface PriceUpdateContextProvider {
  getPriceUpdateContext(quote: Quote): Promise<PriceUpdateContext | null>;
}
