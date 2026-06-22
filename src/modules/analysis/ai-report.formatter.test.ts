import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAiTelegramReport } from "./ai-report.formatter.js";
import type { AiAnalysisOutput } from "./ai-analysis-report.service.js";

describe("formatAiTelegramReport", () => {
  it("keeps the notification compact and focuses on high-risk items", () => {
    const output: AiAnalysisOutput = {
      title: "Pre-Market Daily Focus Report",
      overallSummary: "Several symbols moved, but only the highest-risk setups need attention.",
      focus: [
        createItem("NVDA", "medium"),
        createItem("AVGO", "medium")
      ],
      interesting: [
        createItem("BINANCE:BTCUSDT", "high"),
        createItem("BINANCE:ETHUSDT", "medium")
      ],
      avoid: [
        createItem("GOOGL", "high"),
        createItem("SPCX", "high")
      ],
      neutral: [
        {
          ticker: "INTC",
          reason: "No strong signal."
        }
      ]
    };

    const message = formatAiTelegramReport(output, "20:00");

    assert.ok(message.length <= 1800);
    assert.match(message, /High-risk watch/);
    assert.match(message, /GOOGL/);
    assert.match(message, /SPCX/);
    assert.doesNotMatch(message, /BINANCE:BTCUSDT \(high risk\)/);
    assert.match(message, /Quiet\/omitted:/);
  });
});

function createItem(ticker: string, riskLevel: "low" | "medium" | "high") {
  return {
    ticker,
    riskLevel,
    reason: `${ticker} has an unusual setup.`,
    thesis: `${ticker} needs review because risk is elevated.`,
    setup: `${ticker} setup text.`,
    evidence: [
      "Latest price is near the daily low.",
      "Change percent is outside the usual range.",
      "Snapshot count is enough for analysis."
    ],
    watchLevels: ["Support level", "Recovery level"],
    risk: "Continuation risk remains elevated.",
    actionNote: "Wait for confirmation."
  };
}
