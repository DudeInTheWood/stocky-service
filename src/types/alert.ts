export type AlertType = "buy" | "sell";

export interface AlertNotification {
  type: AlertType;
  symbol: string;
  currentPrice: number;
  targetPrice: number;
}
