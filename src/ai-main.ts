import { pathToFileURL } from "node:url";
import { loadConfig, type AppConfig } from "./config/app-config.js";
import { prisma } from "./db/prisma.js";
import { AiAnalysisReportJob } from "./jobs/ai-analysis-report.job.js";
import { AiAnalysisReportService } from "./modules/analysis/ai-analysis-report.service.js";
import { AnalysisClassifierService } from "./modules/analysis/analysis-classifier.service.js";
import { AnalysisInputService } from "./modules/analysis/analysis-input.service.js";
import { OllamaLlmProvider } from "./modules/llm/ollama-llm.provider.js";
import { TelegramNotificationProvider } from "./modules/notifications/telegram-notification.provider.js";
import { AiAnalysisScheduler } from "./scheduler/ai-analysis.scheduler.js";

export async function runAiAnalysisReportOnce(config = loadConfig()): Promise<void> {
  const job = createAiAnalysisReportJob(config);
  await job.run(config.aiAnalysis.reportTimes[0] ?? "20:00");
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  if (process.argv.includes("--run-once") || process.argv.includes("run-now")) {
    await runAiAnalysisReportOnce(config);
    await prisma.$disconnect();
    return;
  }

  const job = createAiAnalysisReportJob(config);
  const scheduler = new AiAnalysisScheduler({
    config: config.aiAnalysis,
    job
  });

  scheduler.start();
}

function createAiAnalysisReportJob(config: AppConfig): AiAnalysisReportJob {
  const llmProvider = new OllamaLlmProvider({
    baseUrl: config.aiAnalysis.baseUrl,
    model: config.aiAnalysis.model
  });
  const reportService = new AiAnalysisReportService(llmProvider);
  const inputService = new AnalysisInputService({
    timezone: config.aiAnalysis.timezone,
    watchlistSymbols: config.watchlistSymbols,
    minDailySnapshots: config.aiAnalysis.minDailySnapshots,
    maxSymbolsInReport: config.aiAnalysis.maxSymbolsInReport
  });
  const classifierService = new AnalysisClassifierService();
  const notificationProvider = new TelegramNotificationProvider(config.telegram);

  return new AiAnalysisReportJob({
    config: config.aiAnalysis,
    inputService,
    classifierService,
    reportService,
    notificationProvider
  });
}

if (isMainModule()) {
  bootstrap().catch(async (error) => {
    console.error("AI analysis worker failed.", error);
    await prisma.$disconnect();
    process.exit(1);
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}
