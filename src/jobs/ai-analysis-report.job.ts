import type { AiAnalysisConfig } from "../config/app-config.js";
import type { MessageNotificationProvider } from "../modules/notifications/message-notification.provider.js";
import { AnalysisClassifierService } from "../modules/analysis/analysis-classifier.service.js";
import { AnalysisInputService } from "../modules/analysis/analysis-input.service.js";
import {
  createDeterministicAttentionOutput,
  AiAnalysisReportService,
  createNotEnoughDataOutput
} from "../modules/analysis/ai-analysis-report.service.js";
import { formatAiTelegramReport } from "../modules/analysis/ai-report.formatter.js";

export interface AiAnalysisReportJobDependencies {
  config: AiAnalysisConfig;
  inputService: AnalysisInputService;
  classifierService: AnalysisClassifierService;
  reportService: AiAnalysisReportService;
  notificationProviders?: MessageNotificationProvider[];
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
        reportType: "pre_market_attention",
        timeframe: "1d",
        inputJson: input,
        outputJson: output,
        title: output.title,
        summary: telegramMessage,
        category: "lowSignal",
        riskLevel: null,
        confidence: null
      });

      await this.notifyReport(telegramMessage);
      console.log("No symbols available for AI analysis.");
      return;
    }

    const classifiedInput = this.dependencies.classifierService.classify(input);
    const llmOutput = await this.generateReport(classifiedInput);
    const telegramMessage = formatAiTelegramReport(llmOutput, reportTime);

    const reportId = await this.dependencies.reportService.saveReport({
      reportType: classifiedInput.reportType,
      timeframe: classifiedInput.timeframe,
      inputJson: classifiedInput,
      outputJson: llmOutput,
      title: llmOutput.title,
      summary: telegramMessage,
      category: null,
      riskLevel: null,
      confidence: null
    });

    await this.notifyReport(telegramMessage);
    console.log(`AI analysis report saved: ${reportId}`);
  }

  private async notifyReport(message: string): Promise<void> {
    if (!this.dependencies.notificationProviders?.length) {
      return;
    }

    await Promise.all(
      this.dependencies.notificationProviders.map((provider) => provider.notifyMessage(message))
    );
  }

  private async generateReport(
    classifiedInput: ReturnType<AnalysisClassifierService["classify"]>
  ) {
    try {
      return await this.dependencies.reportService.generateReport(classifiedInput);
    } catch (error) {
      console.error("AI analysis LLM output failed; using deterministic attention report.", error);
      return createDeterministicAttentionOutput(classifiedInput);
    }
  }
}
