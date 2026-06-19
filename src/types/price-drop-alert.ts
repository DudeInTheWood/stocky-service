export interface PriceDropAlertNotification {
  symbol: string;
  currentPrice: number;
  dailyLowPrice: number;
  dropPercent: number;
  thresholdPercent: number;
  snapshotCount: number;
  currency: string;
  marketTimestamp: Date;
}
