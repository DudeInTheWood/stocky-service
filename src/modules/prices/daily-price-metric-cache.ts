export interface CachedDailyPriceMetric {
  symbol: string;
  date: Date;
  highPrice: number;
  lowPrice: number;
  snapshotCount: number;
}

export class DailyPriceMetricCache {
  private readonly metricsBySymbol = new Map<string, CachedDailyPriceMetric>();

  set(metric: CachedDailyPriceMetric): void {
    this.metricsBySymbol.set(metric.symbol, metric);
  }

  get(symbol: string): CachedDailyPriceMetric | null {
    return this.metricsBySymbol.get(symbol) ?? null;
  }
}
