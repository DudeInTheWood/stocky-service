import { pathToFileURL } from "node:url";
import { loadConfig, type AppConfig } from "./config/app-config.js";
import { prisma } from "./db/prisma.js";
import { AiAnalysisReportJob } from "./jobs/ai-analysis-report.job.js";
import { MarketContextRefreshJob } from "./jobs/market-context-refresh.job.js";
import { MorningMarketReportJob } from "./jobs/morning-market-report.job.js";
import { AiAnalysisReportService } from "./modules/analysis/ai-analysis-report.service.js";
import { AnalysisClassifierService } from "./modules/analysis/analysis-classifier.service.js";
import { AnalysisInputService } from "./modules/analysis/analysis-input.service.js";
import { OllamaLlmProvider } from "./modules/llm/ollama-llm.provider.js";
import { BasicFinancialsService } from "./modules/market-context/basic-financials.service.js";
import { CompanyNewsService } from "./modules/market-context/company-news.service.js";
import { FinnhubBasicFinancialsProvider } from "./modules/market-context/finnhub-basic-financials.provider.js";
import { FinnhubCompanyNewsProvider } from "./modules/market-context/finnhub-company-news.provider.js";
import { MarketAttentionFactorService } from "./modules/market-context/market-attention-factor.service.js";
import { DiscordNotificationProvider } from "./modules/notifications/discord-notification.provider.js";
import type { MessageNotificationProvider } from "./modules/notifications/message-notification.provider.js";
import { TelegramNotificationProvider } from "./modules/notifications/telegram-notification.provider.js";
import { AiAnalysisScheduler } from "./scheduler/ai-analysis.scheduler.js";
import { MarketContextScheduler } from "./scheduler/market-context.scheduler.js";
import { MorningMarketReportScheduler } from "./scheduler/morning-market-report.scheduler.js";

export async function runAiAnalysisReportOnce(config = loadConfig()): Promise<void> {
  const job = createAiAnalysisReportJob(config);
  await job.run(config.aiAnalysis.reportTimes[0] ?? "20:00");
}

export async function runMarketContextRefreshOnce(config = loadConfig()): Promise<void> {
  const job = createMarketContextRefreshJob(config);
  await job.run();
}

export async function runMorningMarketReportOnce(config = loadConfig()): Promise<void> {
  const job = createMorningMarketReportJob(config);
  await job.run(config.morningReport.reportTimes[0] ?? "10:00");
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  if (process.argv.includes("--refresh-context-once")) {
    await runMarketContextRefreshOnce(config);
    await prisma.$disconnect();
    return;
  }

  if (process.argv.includes("--run-morning-once")) {
    await runMorningMarketReportOnce(config);
    await prisma.$disconnect();
    return;
  }

  if (process.argv.includes("--run-once") || process.argv.includes("run-now")) {
    await runAiAnalysisReportOnce(config);
    await prisma.$disconnect();
    return;
  }

  const job = createAiAnalysisReportJob(config);
  const marketContextJob = createMarketContextRefreshJob(config);
  const marketContextScheduler = new MarketContextScheduler({
    config: config.marketContext,
    job: marketContextJob
  });
  const morningMarketReportJob = createMorningMarketReportJob(config);
  const morningMarketReportScheduler = new MorningMarketReportScheduler({
    config: config.morningReport,
    job: morningMarketReportJob
  });
  const scheduler = new AiAnalysisScheduler({
    config: config.aiAnalysis,
    job
  });

  marketContextScheduler.start();
  morningMarketReportScheduler.start();
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
    maxSymbolsInReport: config.aiAnalysis.maxSymbolsInReport,
    includeNewsFactors: config.aiAnalysis.includeNewsFactors,
    includeFundamentalFactors: config.aiAnalysis.includeFundamentalFactors,
    newsLookbackDays: config.marketContext.newsLookbackDays,
    maxNewsItemsPerSymbol: config.marketContext.maxNewsItemsPerSymbol,
    marketContextProvider: config.marketContext.provider,
    attentionFactorService: new MarketAttentionFactorService()
  });
  const classifierService = new AnalysisClassifierService();
  const notificationProviders = createAiReportNotificationProviders(config);

  return new AiAnalysisReportJob({
    config: config.aiAnalysis,
    inputService,
    classifierService,
    reportService,
    notificationProviders
  });
}

function createMarketContextRefreshJob(config: AppConfig): MarketContextRefreshJob {
  const companyNewsProvider = new FinnhubCompanyNewsProvider(config.finnhub);
  const basicFinancialsProvider = new FinnhubBasicFinancialsProvider(config.finnhub);

  return new MarketContextRefreshJob({
    config: config.marketContext,
    watchlistSymbols: config.watchlistSymbols,
    companyNewsService: new CompanyNewsService(companyNewsProvider),
    basicFinancialsService: new BasicFinancialsService(basicFinancialsProvider)
  });
}

function createMorningMarketReportJob(config: AppConfig): MorningMarketReportJob {
  const llmProvider = new OllamaLlmProvider({
    baseUrl: config.aiAnalysis.baseUrl,
    model: config.aiAnalysis.model
  });

  return new MorningMarketReportJob({
    config: config.morningReport,
    watchlistSymbols: config.watchlistSymbols,
    marketContextProvider: config.marketContext.provider,
    attentionFactorService: new MarketAttentionFactorService(),
    reportService: new AiAnalysisReportService(llmProvider),
    marketContextRefreshJob: createMarketContextRefreshJob(config),
    notificationProviders: createMorningReportNotificationProviders(config)
  });
}

function createAiReportNotificationProviders(config: AppConfig): MessageNotificationProvider[] {
  const providers: MessageNotificationProvider[] = [];

  if (config.aiAnalysis.notifyTelegram) {
    providers.push(new TelegramNotificationProvider(config.telegram));
  }

  if (config.aiAnalysis.notifyDiscord) {
    providers.push(new DiscordNotificationProvider(config.discord));
  }

  return providers;
}

function createMorningReportNotificationProviders(config: AppConfig): MessageNotificationProvider[] {
  if (!config.morningReport.notifyDiscord) {
    return [];
  }

  return [new DiscordNotificationProvider(config.discord)];
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
