import type { AlertNotification } from "../../types/alert.js";

export interface NotificationProvider {
  notifyStartup(): Promise<void>;
  notifyFetchFailure(error: unknown): Promise<void>;
  notifyAlert(alert: AlertNotification): Promise<void>;
}
