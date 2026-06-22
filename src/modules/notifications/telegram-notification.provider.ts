import type { TelegramConfig } from "../../config/app-config.js";
import type { AlertNotification } from "../../types/alert.js";
import type { PriceDropAlertNotification } from "../../types/price-drop-alert.js";
import type { Quote } from "../../types/quote.js";
import type { NotificationProvider } from "./notification.provider.js";
import type { PriceUpdateContextProvider } from "./price-update-context.provider.js";

export class TelegramNotificationProvider implements NotificationProvider {
  private readonly apiBaseUrl = "https://api.telegram.org";

  constructor(
    private readonly config: TelegramConfig,
    private readonly priceUpdateContextProvider?: PriceUpdateContextProvider
  ) {}

  async notifyStartup(): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.sendMessage("Stock watcher started.");
  }

  async notifyFetchFailure(_error: unknown): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.sendMessage("Stock watcher fetch failed. Check service logs.");
  }

  async notifyAlert(_alert: AlertNotification): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.sendMessage(
      [
        `${_alert.type.toUpperCase()} SIGNAL`,
        `Symbol: ${_alert.symbol}`,
        `Current Price: ${formatPrice(_alert.currentPrice)}`,
        `Target Price: ${formatPrice(_alert.targetPrice)}`
      ].join("\n")
    );
  }

  async notifyPriceUpdate(quote: Quote): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.sendMessage(await this.createPriceUpdateMessage(quote));
  }

  async notifyPriceDropAlert(alert: PriceDropAlertNotification): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.sendMessage(
      [
        "PRICE DROP ALERT",
        `Symbol: ${alert.symbol}`,
        `Current Price: ${formatPrice(alert.currentPrice)} ${alert.currency}`,
        `Today Low: ${formatPrice(alert.dailyLowPrice)} ${alert.currency}`,
        `Below Low: ${formatPercent(alert.dropPercent)}`,
        `Trigger: ${formatPercent(alert.thresholdPercent)}`,
        `Daily Snapshots: ${alert.snapshotCount}`,
        `Market Time: ${alert.marketTimestamp.toISOString()}`
      ].join("\n")
    );
  }

  async notifyMessage(message: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.sendMessage(message);
  }

  private async createPriceUpdateMessage(quote: Quote): Promise<string> {
    const lines = [
      "PRICE UPDATE",
      `Symbol: ${quote.symbol}`,
      `Price: ${formatPrice(quote.price)} ${quote.currency}`
    ];

    const context = await this.getPriceUpdateContext(quote);

    if (context) {
      lines.push(
        `Today High: ${formatPrice(context.dailyHighPrice)} ${quote.currency}`,
        `Today Low: ${formatPrice(context.dailyLowPrice)} ${quote.currency}`,
        `Daily Snapshots: ${context.snapshotCount}`
      );
    }

    lines.push(`Market Time: ${quote.marketTimestamp.toISOString()}`, `Source: ${quote.source}`);

    return lines.join("\n");
  }

  private async getPriceUpdateContext(quote: Quote) {
    if (!this.priceUpdateContextProvider) {
      return null;
    }

    try {
      return await this.priceUpdateContextProvider.getPriceUpdateContext(quote);
    } catch (error) {
      console.error("Failed to load Telegram price update context.", error);
      return null;
    }
  }

  private async sendMessage(text: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/bot${this.config.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: this.config.chatId,
        text,
        disable_notification: false
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.config.botToken && this.config.chatId);
  }
}

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  })}%`;
}
