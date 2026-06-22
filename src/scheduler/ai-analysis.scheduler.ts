import cron from "node-cron";
import type { AiAnalysisConfig } from "../config/app-config.js";
import type { AiAnalysisReportJob } from "../jobs/ai-analysis-report.job.js";

export interface AiAnalysisSchedulerOptions {
  config: AiAnalysisConfig;
  job: AiAnalysisReportJob;
}

export class AiAnalysisScheduler {
  private isRunning = false;

  constructor(private readonly options: AiAnalysisSchedulerOptions) {}

  start(): void {
    if (!this.options.config.enabled) {
      console.log("AI analysis scheduler is disabled.");
      return;
    }

    for (const reportTime of this.options.config.reportTimes) {
      const expression = toCronExpression(reportTime);

      cron.schedule(expression, () => void this.runJob(reportTime), {
        timezone: this.options.config.timezone
      });
    }

    console.log(
      `AI analysis scheduler active in ${this.options.config.timezone}: ${this.options.config.reportTimes.join(", ")}.`
    );
  }

  private async runJob(reportTime: string): Promise<void> {
    if (this.isRunning) {
      console.log("Previous AI analysis run is still active. Skipping this tick.");
      return;
    }

    this.isRunning = true;
    console.log(`Starting AI analysis report for ${reportTime}.`);

    try {
      await this.options.job.run(reportTime);
      console.log(`AI analysis report completed for ${reportTime}.`);
    } catch (error) {
      console.error(`AI analysis report failed for ${reportTime}.`, error);
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
    throw new Error(`Invalid AI report time "${reportTime}". Expected HH:mm.`);
  }

  return `${minute} ${hour} * * *`;
}
