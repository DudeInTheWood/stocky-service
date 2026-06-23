import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAiTelegramReport } from "./ai-report.formatter.js";
import type { AiAnalysisOutput, AiAnalysisOutputItem } from "./ai-analysis-report.service.js";

describe("formatAiTelegramReport", () => {
  it("keeps the notification compact and focuses on high-risk attention items", () => {
    const output: AiAnalysisOutput = {
      title: "Pre-market Attention Report",
      overallSummary: "Several symbols moved, but only the highest-risk attention items need review.",
      watchlist: [
        createItem("NVDA", "medium"),
        createItem("AVGO", "medium")
      ],
      highAttention: [
        createItem("NVDA", "high"),
        createItem("AVGO", "medium")
      ],
      avoidChasing: [
        createItem("GOOGL", "high"),
        createItem("SPCX", "high")
      ],
      lowSignal: [
        {
          ticker: "INTC",
          reason: "No strong signal.",
          attentionDrivers: []
        }
      ]
    };

    const message = formatAiTelegramReport(output, "20:00");

    assert.ok(message.length <= 1800);
    assert.match(message, /Attention watch/);
    assert.match(message, /GOOGL/);
    assert.match(message, /SPCX/);
    assert.doesNotMatch(message, /NVDA \(high risk\)/);
    assert.match(message, /Low-signal\/omitted:/);
  });
});

function createItem(ticker: string, riskLevel: "low" | "medium" | "high"): AiAnalysisOutputItem {
  return {
    ticker,
    riskLevel,
    reason: `${ticker} has an unusual setup.`,
    attentionDrivers: ["price"],
    riskContext: "Volatility is elevated.",
    evidence: [
      "Latest price is near the daily low.",
      "Change percent is outside the usual range.",
      "Snapshot count is enough for analysis."
    ],
    watchLevels: ["Support level", "Recovery level"]
  };
}
