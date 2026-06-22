import type { AiAnalysisOutput, AiAnalysisOutputItem, AiAnalysisNeutralItem } from "./ai-analysis-report.service.js";

const MAX_TELEGRAM_LENGTH = 3800;
const MAX_NOTIFICATION_LENGTH = 1800;
const MAX_DETAILED_ITEMS = 2;

export function formatAiTelegramReport(output: AiAnalysisOutput, reportTime: string): string {
  const selectedItems = selectDetailedItems(output);

  const lines = [
    `${output.title || "Pre-market Daily Focus"} - ${reportTime} GMT+7`,
    "",
    output.overallSummary,
    "",
    ...formatSelectedItems(selectedItems),
    ...formatQuietList(output, selectedItems),
    "Data-only summary. Not financial advice."
  ];

  return truncateMessage(sanitizeAdviceLanguage(lines.filter(Boolean).join("\n")), MAX_NOTIFICATION_LENGTH);
}

function selectDetailedItems(output: AiAnalysisOutput): AiAnalysisOutputItem[] {
  const categorizedItems = [
    ...output.avoid.map((item) => ({ ...item, section: "Avoid chasing" })),
    ...output.interesting.map((item) => ({ ...item, section: "Interesting" })),
    ...output.focus.map((item) => ({ ...item, section: "Focus" }))
  ];
  const highRiskItems = categorizedItems.filter((item) => item.riskLevel === "high");
  const candidates = highRiskItems.length > 0 ? highRiskItems : categorizedItems;

  return candidates.slice(0, MAX_DETAILED_ITEMS);
}

function formatSelectedItems(items: AiAnalysisOutputItem[]): string[] {
  if (items.length === 0) {
    return ["No high-risk watchlist names stood out from the stored metrics.", ""];
  }

  return [
    "High-risk watch",
    ...items.flatMap((item) => [
      `${item.ticker} (${item.riskLevel} risk)`,
      `- Why: ${item.thesis || item.reason}`,
      ...formatList("Evidence", item.evidence.slice(0, 2)),
      ...formatList("Watch", item.watchLevels.slice(0, 2)),
      ...formatOptionalLine("Risk", item.risk),
      ""
    ]),
    ""
  ];
}

function formatQuietList(output: AiAnalysisOutput, selectedItems: AiAnalysisOutputItem[]): string[] {
  const selectedTickers = new Set(selectedItems.map((item) => item.ticker));
  const quietTickers = [
    ...output.focus,
    ...output.interesting,
    ...output.avoid,
    ...output.neutral
  ]
    .map((item) => item.ticker)
    .filter((ticker) => !selectedTickers.has(ticker))
    .slice(0, 6);

  if (quietTickers.length === 0) {
    return [];
  }

  return [`Quiet/omitted: ${quietTickers.join(", ")}`, ""];
}

function formatOptionalLine(label: string, value: string): string[] {
  return value ? [`- ${label}: ${value}`] : [];
}

function formatList(label: string, values: string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [`- ${label}: ${values.join("; ")}`];
}

function truncateMessage(message: string, maxLength = MAX_TELEGRAM_LENGTH): string {
  if (message.length <= maxLength) {
    return message;
  }

  return `${message.slice(0, maxLength - 32).trim()}\n\n[truncated]`;
}

function sanitizeAdviceLanguage(message: string): string {
  return message
    .replace(/\bbuy\b/gi, "watch")
    .replace(/\bsell\b/gi, "reduce exposure")
    .replace(/\blong entries\b/gi, "new exposure")
    .replace(/\blong positions\b/gi, "new exposure")
    .replace(/\bshort entries\b/gi, "downside exposure")
    .replace(/\bshort positions\b/gi, "downside exposure")
    .replace(/\bstrong watch\b/gi, "watch");
}
