import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import type { LlmProvider } from "../llm/llm.provider.js";
import { buildAiAnalysisMessages } from "./ai-analysis-prompt.js";
import type { ClassifiedAnalysisInput } from "./analysis-classifier.service.js";

export type RiskLevel = "low" | "medium" | "high";

export interface AiAnalysisOutputItem {
  ticker: string;
  reason: string;
  riskLevel: RiskLevel;
  thesis: string;
  setup: string;
  evidence: string[];
  watchLevels: string[];
  risk: string;
  actionNote: string;
}

export interface AiAnalysisNeutralItem {
  ticker: string;
  reason: string;
}

export interface AiAnalysisOutput {
  title: string;
  overallSummary: string;
  interesting: AiAnalysisOutputItem[];
  focus: AiAnalysisOutputItem[];
  avoid: AiAnalysisOutputItem[];
  neutral: AiAnalysisNeutralItem[];
  telegramMessage?: string;
}

export interface SaveAiReportInput {
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
        NULL,
        NULL,
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
    title: parseString(value.title, "Pre-market Daily Focus Report"),
    overallSummary: parseString(value.overallSummary, "AI analysis completed."),
    interesting: parseOutputItems(value.interesting),
    focus: parseOutputItems(value.focus),
    avoid: parseOutputItems(value.avoid),
    neutral: parseNeutralItems(value.neutral),
    telegramMessage:
      typeof value.telegramMessage === "string" && value.telegramMessage.trim()
        ? value.telegramMessage.trim()
        : undefined
  };
}

export function createNotEnoughDataOutput(summary: string): AiAnalysisOutput {
  return {
    title: "Pre-market Daily Focus Report",
    overallSummary: summary,
    interesting: [],
    focus: [],
    avoid: [],
    neutral: [],
    telegramMessage: summary
  };
}

function parseOutputItems(value: unknown): AiAnalysisOutputItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    ticker: parseString(item.ticker, "UNKNOWN"),
    reason: parseString(item.reason, "No reason provided."),
    riskLevel: parseRiskLevel(item.riskLevel),
    thesis: parseString(item.thesis, parseString(item.reason, "No thesis provided.")),
    setup: parseString(item.setup, ""),
    evidence: parseStringList(item.evidence),
    watchLevels: parseStringList(item.watchLevels),
    risk: parseString(item.risk, ""),
    actionNote: parseString(item.actionNote, "")
  }));
}

function parseNeutralItems(value: unknown): AiAnalysisNeutralItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    ticker: parseString(item.ticker, "UNKNOWN"),
    reason: parseString(item.reason, "No reason provided.")
  }));
}

function parseRiskLevel(value: unknown): RiskLevel {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
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
