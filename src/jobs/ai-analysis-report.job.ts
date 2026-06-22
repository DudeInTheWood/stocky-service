import type { AiAnalysisConfig } from "../config/app-config.js";
import type { TelegramNotificationProvider } from "../modules/notifications/telegram-notification.provider.js";
import { AnalysisClassifierService } from "../modules/analysis/analysis-classifier.service.js";
import { AnalysisInputService } from "../modules/analysis/analysis-input.service.js";
import {
  AiAnalysisReportService,
  createNotEnoughDataOutput
} from "../modules/analysis/ai-analysis-report.service.js";
import { formatAiTelegramReport } from "../modules/analysis/ai-report.formatter.js";

export interface AiAnalysisReportJobDependencies {
  config: AiAnalysisConfig;
  inputService: AnalysisInputService;
  classifierService: AnalysisClassifierService;
  reportService: AiAnalysisReportService;
  notificationProvider?: TelegramNotificationProvider;
}

export class AiAnalysisReportJob {
  constructor(private readonly dependencies: AiAnalysisReportJobDependencies) {}

  async run(reportTime = this.dependencies.config.reportTimes[0] ?? "20:00"): Promise<void> {
    const input = await this.dependencies.inputService.buildPreMarketDailyInput();

    if (input.symbols.length === 0) {
      const summary = "Pre-market AI analysis skipped: no daily metrics are available yet.";
      const output = createNotEnoughDataOutput(summary);
      const telegramMessage = formatAiTelegramReport(output, reportTime);

      await this.dependencies.reportService.saveReport({
        reportType: "pre_market_daily",
        timeframe: "1d",
        inputJson: input,
        outputJson: output,
        title: output.title,
        summary: telegramMessage,
        category: "neutral",
        riskLevel: null,
        confidence: null
      });

      await this.notifyTelegram(telegramMessage);
      console.log("No symbols available for AI analysis.");
      return;
    }

    const classifiedInput = this.dependencies.classifierService.classify(input);
    const llmOutput = await this.dependencies.reportService.generateReport(classifiedInput);
    const telegramMessage = formatAiTelegramReport(llmOutput, reportTime);

    const reportId = await this.dependencies.reportService.saveReport({
      reportType: "pre_market_daily",
      timeframe: classifiedInput.timeframe,
      inputJson: classifiedInput,
      outputJson: llmOutput,
      title: llmOutput.title,
      summary: telegramMessage,
      category: null,
      riskLevel: null,
      confidence: null
    });

    await this.notifyTelegram(telegramMessage);
    console.log(`AI analysis report saved: ${reportId}`);
  }

  private async notifyTelegram(message: string): Promise<void> {
    if (!this.dependencies.config.notifyTelegram || !this.dependencies.notificationProvider) {
      return;
    }

    await this.dependencies.notificationProvider.notifyMessage(message);
  }
}
