import type { AiAnalysisOutput, AiAnalysisOutputItem, AiAnalysisNeutralItem } from "./ai-analysis-report.service.js";

const MAX_TELEGRAM_LENGTH = 3800;

export function formatAiTelegramReport(output: AiAnalysisOutput, reportTime: string): string {
  const lines = [
    `${output.title || "Pre-market Daily Focus"} - ${reportTime} GMT+7`,
    "",
    ...formatRiskSection("Focus", output.focus),
    ...formatRiskSection("Interesting", output.interesting),
    ...formatRiskSection("Avoid chasing", output.avoid),
    ...formatNeutralSection("Neutral", output.neutral),
    "Data-only summary. Not financial advice."
  ];

  return truncateMessage(sanitizeAdviceLanguage(lines.filter(Boolean).join("\n")));
}

function formatRiskSection(title: string, items: AiAnalysisOutputItem[]): string[] {
  if (items.length === 0) {
    return [];
  }

  return [title, ...items.map((item) => `- ${item.ticker}: ${item.reason}`), ""];
}

function formatNeutralSection(title: string, items: AiAnalysisNeutralItem[]): string[] {
  if (items.length === 0) {
    return [];
  }

  return [title, ...items.map((item) => `- ${item.ticker}: ${item.reason}`), ""];
}

function truncateMessage(message: string): string {
  if (message.length <= MAX_TELEGRAM_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_TELEGRAM_LENGTH - 32).trim()}\n\n[truncated]`;
}

function sanitizeAdviceLanguage(message: string): string {
  return message
    .replace(/\bbuy\b/gi, "watch")
    .replace(/\bsell\b/gi, "reduce exposure")
    .replace(/\bstrong watch\b/gi, "watch");
}
