import cron from "node-cron";
import type { MarketContextConfig } from "../config/app-config.js";
import type { MarketContextRefreshJob } from "../jobs/market-context-refresh.job.js";

export interface MarketContextSchedulerOptions {
  config: MarketContextConfig;
  job: MarketContextRefreshJob;
}

export class MarketContextScheduler {
  private isRunning = false;

  constructor(private readonly options: MarketContextSchedulerOptions) {}

  start(): void {
    if (!this.options.config.enabled) {
      console.log("Market context scheduler is disabled.");
      return;
    }

    for (const refreshTime of this.options.config.refreshTimes) {
      const expression = toCronExpression(refreshTime);

      cron.schedule(expression, () => void this.runJob(refreshTime), {
        timezone: this.options.config.timezone
      });
    }

    console.log(
      `Market context scheduler active in ${this.options.config.timezone}: ${this.options.config.refreshTimes.join(", ")}.`
    );
  }

  private async runJob(refreshTime: string): Promise<void> {
    if (this.isRunning) {
      console.log("Previous market context refresh is still active. Skipping this tick.");
      return;
    }

    this.isRunning = true;
    console.log(`Starting market context refresh for ${refreshTime}.`);

    try {
      await this.options.job.run();
      console.log(`Market context refresh completed for ${refreshTime}.`);
    } catch (error) {
      console.error(`Market context refresh failed for ${refreshTime}.`, error);
    } finally {
      this.isRunning = false;
    }
  }
}

function toCronExpression(reportTime: string): string {
  const [hourText, minuteText] = reportTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Invalid market context refresh time "${reportTime}". Expected HH:mm.`);
  }

  return `${minute} ${hour} * * *`;
}
