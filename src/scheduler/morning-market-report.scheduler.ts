import cron from "node-cron";
import type { MorningReportConfig } from "../config/app-config.js";
import type { MorningMarketReportJob } from "../jobs/morning-market-report.job.js";

export interface MorningMarketReportSchedulerOptions {
  config: MorningReportConfig;
  job: MorningMarketReportJob;
}

export class MorningMarketReportScheduler {
  private isRunning = false;

  constructor(private readonly options: MorningMarketReportSchedulerOptions) {}

  start(): void {
    if (!this.options.config.enabled) {
      console.log("Morning market report scheduler is disabled.");
      return;
    }

    for (const reportTime of this.options.config.reportTimes) {
      cron.schedule(toCronExpression(reportTime), () => void this.runJob(reportTime), {
        timezone: this.options.config.timezone
      });
    }

    console.log(
      `Morning market report scheduler active in ${this.options.config.timezone}: ${this.options.config.reportTimes.join(", ")}.`
    );
  }

  private async runJob(reportTime: string): Promise<void> {
    if (this.isRunning) {
      console.log("Previous morning market report is still active. Skipping this tick.");
      return;
    }

    this.isRunning = true;
    console.log(`Starting morning market report for ${reportTime}.`);

    try {
      await this.options.job.run(reportTime);
      console.log(`Morning market report completed for ${reportTime}.`);
    } catch (error) {
      console.error(`Morning market report failed for ${reportTime}.`, error);
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
    throw new Error(`Invalid morning report time "${reportTime}". Expected HH:mm.`);
  }

  return `${minute} ${hour} * * *`;
}
