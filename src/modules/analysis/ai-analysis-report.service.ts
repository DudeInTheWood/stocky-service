import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import type { LlmProvider } from "../llm/llm.provider.js";
import { buildAiAnalysisMessages } from "./ai-analysis-prompt.js";
import type {
  AttentionCategory,
  ClassifiedAnalysisInput,
  ClassifiedAnalysisSymbol
} from "./analysis-classifier.service.js";

export type RiskLevel = "low" | "medium" | "high";
export type AttentionDriver = "price" | "news" | "fundamentals" | "data_quality";

export interface AiAnalysisOutputItem {
  ticker: string;
  reason: string;
  attentionDrivers: AttentionDriver[];
  riskContext: string;
  riskLevel: RiskLevel;
  evidence: string[];
  watchLevels: string[];
}

export interface AiAnalysisNeutralItem {
  ticker: string;
  reason: string;
  attentionDrivers: AttentionDriver[];
}

export interface AiAnalysisOutput {
  title: string;
  overallSummary: string;
  highAttention: AiAnalysisOutputItem[];
  watchlist: AiAnalysisOutputItem[];
  avoidChasing: AiAnalysisOutputItem[];
  lowSignal: AiAnalysisNeutralItem[];
  telegramMessage?: string;
}

export interface SaveAiReportInput {
  symbolId?: string | null;
  ticker?: string | null;
  reportType: string;
  timeframe: string;
  inputJson: unknown;
  outputJson: unknown | null;
  title: string;
  summary: string;
  category?: string | null;
  riskLevel?: string | null;
  confidence?: number | null;
}

export class AiAnalysisReportService {
  constructor(private readonly llmProvider: LlmProvider) {}

  async generateReport(input: ClassifiedAnalysisInput): Promise<AiAnalysisOutput> {
    const output = await this.llmProvider.completeJson(buildAiAnalysisMessages(input));
    return normalizeAiAnalysisOutput(output);
  }

  async saveReport(input: SaveAiReportInput): Promise<string> {
    const id = randomUUID();
    const inputJson = JSON.stringify(input.inputJson);
    const outputJson = input.outputJson === null ? null : JSON.stringify(input.outputJson);

    await prisma.$executeRaw`
      INSERT INTO "ai_analysis_reports" (
        "id",
        "symbol_id",
        "ticker",
        "report_type",
        "timeframe",
        "input_json",
        "output_json",
        "title",
        "summary",
        "category",
        "risk_level",
        "confidence"
      )
      VALUES (
        ${id}::uuid,
        ${input.symbolId ?? null}::uuid,
        ${input.ticker ?? null},
        ${input.reportType},
        ${input.timeframe},
        ${inputJson}::jsonb,
        ${outputJson}::jsonb,
        ${truncate(input.title, 200)},
        ${input.summary},
        ${input.category ?? null},
        ${input.riskLevel ?? null},
        ${input.confidence ?? null}
      )
    `;

    return id;
  }
}

export function normalizeAiAnalysisOutput(value: unknown): AiAnalysisOutput {
  if (!isRecord(value)) {
    throw new Error("AI analysis output must be a JSON object.");
  }

  return {
    title: parseString(value.title, "Pre-market Attention Report"),
    overallSummary: parseString(value.overallSummary, "AI analysis completed."),
    highAttention: parseOutputItems(value.highAttention ?? value.interesting),
    watchlist: parseOutputItems(value.watchlist ?? value.focus),
    avoidChasing: parseOutputItems(value.avoidChasing ?? value.avoid),
    lowSignal: parseNeutralItems(value.lowSignal ?? value.neutral),
    telegramMessage:
      typeof value.telegramMessage === "string" && value.telegramMessage.trim()
        ? value.telegramMessage.trim()
        : undefined
  };
}

export function createNotEnoughDataOutput(summary: string): AiAnalysisOutput {
  return {
    title: "Pre-market Attention Report",
    overallSummary: summary,
    highAttention: [],
    watchlist: [],
    avoidChasing: [],
    lowSignal: [],
    telegramMessage: summary
  };
}

export function createDeterministicAttentionOutput(input: ClassifiedAnalysisInput): AiAnalysisOutput {
  const sortedSymbols = [...input.symbols].sort(
    (left, right) => right.attentionScore - left.attentionScore
  );

  return {
    title: "Pre-market Attention Report",
    overallSummary: createFallbackSummary(sortedSymbols),
    highAttention: sortedSymbols
      .filter((symbol) => symbol.categoryCandidate === "highAttention")
      .slice(0, 2)
      .map(createOutputItem),
    watchlist: sortedSymbols
      .filter((symbol) => symbol.categoryCandidate === "watchlist")
      .slice(0, 2)
      .map(createOutputItem),
    avoidChasing: sortedSymbols
      .filter((symbol) => symbol.categoryCandidate === "avoidChasing")
      .slice(0, 2)
      .map(createOutputItem),
    lowSignal: sortedSymbols
      .filter((symbol) => symbol.categoryCandidate === "lowSignal")
      .slice(0, 2)
      .map((symbol) => ({
        ticker: symbol.ticker,
        reason: `${symbol.ticker} has a low attention score (${symbol.attentionScore}) from stored factors.`,
        attentionDrivers: getAttentionDrivers(symbol)
      })),
    telegramMessage: ""
  };
}

function parseOutputItems(value: unknown): AiAnalysisOutputItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    ticker: parseString(item.ticker, "UNKNOWN"),
    reason: parseString(item.reason, "No reason provided."),
    attentionDrivers: parseAttentionDrivers(item.attentionDrivers),
    riskContext: parseString(item.riskContext, ""),
    riskLevel: parseRiskLevel(item.riskLevel),
    evidence: parseStringList(item.evidence),
    watchLevels: parseStringList(item.watchLevels)
  }));
}

function createFallbackSummary(symbols: ClassifiedAnalysisSymbol[]): string {
  const leaders = symbols
    .filter((symbol) => symbol.attentionScore > 0)
    .slice(0, 3)
    .map((symbol) => `${symbol.ticker} (${symbol.attentionScore})`);

  if (leaders.length === 0) {
    return "Stored price, news, and fundamental factors are quiet across the watchlist.";
  }

  return `Attention is led by ${leaders.join(", ")} based on stored price, news, and fundamental factors.`;
}

function createOutputItem(symbol: ClassifiedAnalysisSymbol): AiAnalysisOutputItem {
  return {
    ticker: symbol.ticker,
    reason: createReason(symbol),
    attentionDrivers: getAttentionDrivers(symbol),
    riskContext: createRiskContext(symbol),
    riskLevel: getRiskLevel(symbol),
    evidence: createEvidence(symbol),
    watchLevels: [
      `Daily range ${formatNumber(symbol.dailyLow)}-${formatNumber(symbol.dailyHigh)}`,
      `Latest price ${formatNumber(symbol.latestPrice)} with attention score ${symbol.attentionScore}`
    ]
  };
}

function createReason(symbol: ClassifiedAnalysisSymbol): string {
  const categoryText: Record<AttentionCategory, string> = {
    highAttention: "worth monitoring",
    watchlist: "needs confirmation",
    avoidChasing: "looks noisy enough to avoid chasing",
    lowSignal: "is low signal"
  };

  return `${symbol.ticker} ${categoryText[symbol.categoryCandidate]} with an attention score of ${symbol.attentionScore}.`;
}

function createEvidence(symbol: ClassifiedAnalysisSymbol): string[] {
  const evidence = [...symbol.attentionReasons];
  const headline = symbol.newsFactor?.headlines[0];

  if (headline) {
    evidence.unshift(`News attention: ${headline.headline}`);
  }

  return evidence.slice(0, 2);
}

function getAttentionDrivers(symbol: ClassifiedAnalysisSymbol): AttentionDriver[] {
  const drivers: AttentionDriver[] = [];

  if (symbol.priceFactor.score > 0) {
    drivers.push("price");
  }

  if ((symbol.newsFactor?.score ?? 0) > 0) {
    drivers.push("news");
  }

  if ((symbol.fundamentalFactor?.score ?? 0) > 0) {
    drivers.push("fundamentals");
  }

  if (symbol.dataQuality !== "ok") {
    drivers.push("data_quality");
  }

  return drivers;
}

function createRiskContext(symbol: ClassifiedAnalysisSymbol): string {
  if (symbol.dataQuality !== "ok") {
    return "Data quality needs confirmation before interpreting the move.";
  }

  if (symbol.volatilityLabel === "extreme" || symbol.volatilityLabel === "high") {
    return "Volatility context is elevated.";
  }

  if (symbol.fundamentalFactor?.valuationLabel === "high") {
    return "Valuation context is elevated.";
  }

  if (symbol.fundamentalFactor?.valuationLabel === "extreme") {
    return "Valuation context is extremely elevated.";
  }

  return "Context is based on stored attention factors only.";
}

function getRiskLevel(symbol: ClassifiedAnalysisSymbol): RiskLevel {
  if (
    symbol.categoryCandidate === "avoidChasing" ||
    symbol.attentionScore >= 60 ||
    symbol.volatilityLabel === "extreme"
  ) {
    return "high";
  }

  if (symbol.attentionScore >= 30 || symbol.volatilityLabel === "high") {
    return "medium";
  }

  return "low";
}

function parseNeutralItems(value: unknown): AiAnalysisNeutralItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    ticker: parseString(item.ticker, "UNKNOWN"),
    reason: parseString(item.reason, "No reason provided."),
    attentionDrivers: parseAttentionDrivers(item.attentionDrivers)
  }));
}

function parseAttentionDrivers(value: unknown): AttentionDriver[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is AttentionDriver => {
    return item === "price" || item === "news" || item === "fundamentals" || item === "data_quality";
  });
}

function parseRiskLevel(value: unknown): RiskLevel {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 4
  });
}

function parseString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : value.slice(0, length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
