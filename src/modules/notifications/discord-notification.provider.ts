import type { DiscordConfig } from "../../config/app-config.js";
import type { MessageNotificationProvider } from "./message-notification.provider.js";

const DISCORD_CONTENT_LIMIT = 2000;
const DISCORD_SAFE_CONTENT_LIMIT = 1900;

export class DiscordNotificationProvider implements MessageNotificationProvider {
  constructor(private readonly config: DiscordConfig) {}

  async notifyMessage(message: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    for (const chunk of splitDiscordMessage(message)) {
      await this.sendWebhookMessage(chunk);
    }
  }

  private async sendWebhookMessage(content: string): Promise<void> {
    const response = await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content,
        username: this.config.username
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Discord webhook send failed: ${response.status} ${body}`);
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.config.webhookUrl);
  }
}

function splitDiscordMessage(message: string): string[] {
  if (message.length <= DISCORD_CONTENT_LIMIT) {
    return [message];
  }

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > DISCORD_SAFE_CONTENT_LIMIT) {
    const splitIndex = findSplitIndex(remaining);
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function findSplitIndex(message: string): number {
  const newlineIndex = message.lastIndexOf("\n", DISCORD_SAFE_CONTENT_LIMIT);

  if (newlineIndex > DISCORD_SAFE_CONTENT_LIMIT * 0.5) {
    return newlineIndex;
  }

  return DISCORD_SAFE_CONTENT_LIMIT;
}
