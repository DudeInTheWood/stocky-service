import cron from "node-cron";
import type { MarketWindowConfig } from "../config/app-config.js";
import type { StockFetchJob } from "../jobs/stock-fetch.job.js";
import type { FinnhubTradeStreamService } from "../modules/trades/finnhub-trade-stream.service.js";

export interface StockFetchSchedulerOptions {
  timezone: string;
  marketWindow: MarketWindowConfig;
  job: StockFetchJob;
  tradeStreamService: FinnhubTradeStreamService;
}

export class StockFetchScheduler {
  private isSnapshotRunning = false;
  private snapshotInterval: NodeJS.Timeout | null = null;

  constructor(private readonly options: StockFetchSchedulerOptions) {}

  start(): void {
    this.reconcileStream();

    cron.schedule("* * * * *", () => this.reconcileStream(), {
      timezone: this.options.timezone
    });

    this.snapshotInterval = setInterval(() => {
      void this.runSnapshotIfWindowOpen();
    }, this.options.marketWindow.snapshotIntervalSeconds * 1000);

    console.log(
      `Scheduler active in ${this.options.timezone}: stream window ${this.options.marketWindow.start}-${this.options.marketWindow.end}, snapshots every ${this.options.marketWindow.snapshotIntervalSeconds} second(s).`
    );
  }

  private reconcileStream(): void {
    if (this.isMarketWindowOpen(new Date())) {
      this.options.tradeStreamService.start();
      return;
    }

    this.options.tradeStreamService.stop();
  }

  private async runSnapshotIfWindowOpen(): Promise<void> {
    if (!this.isMarketWindowOpen(new Date())) {
      return;
    }

    if (this.isSnapshotRunning) {
      console.log("Previous price snapshot run is still active. Skipping this tick.");
      return;
    }

    this.isSnapshotRunning = true;

    try {
      await this.options.job.run();
    } catch (error) {
      console.error("Scheduled price snapshot failed.", error);
    } finally {
      this.isSnapshotRunning = false;
    }
  }

  private isMarketWindowOpen(date: Date): boolean {
    const currentMinute = getMinuteOfDay(date, this.options.timezone);
    const startMinute = parseTimeToMinuteOfDay(this.options.marketWindow.start);
    const endMinute = parseTimeToMinuteOfDay(this.options.marketWindow.end);

    if (startMinute === endMinute) {
      return true;
    }

    if (startMinute < endMinute) {
      return currentMinute >= startMinute && currentMinute < endMinute;
    }

    return currentMinute >= startMinute || currentMinute < endMinute;
  }
}

function parseTimeToMinuteOfDay(value: string): number {
  const [hourText, minuteText] = value.split(":");
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
    throw new Error(`Invalid time value "${value}". Expected HH:mm.`);
  }

  return hour * 60 + minute;
}

function getMinuteOfDay(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  return hour * 60 + minute;
}
