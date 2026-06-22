import type { LlmMessage } from "../llm/llm.provider.js";
import type { ClassifiedAnalysisInput } from "./analysis-classifier.service.js";

const SYSTEM_MESSAGE = [
  "You analyze stock price movement from structured data.",
  "Use only the provided data.",
  "Do not provide financial advice.",
  "Do not recommend buy or sell.",
  "Select only the symbols that are worth attention today.",
  "Classify selected symbols as interesting, focus, avoid, or neutral.",
  "Return only valid JSON."
].join(" ");

export function buildAiAnalysisMessages(input: ClassifiedAnalysisInput): LlmMessage[] {
  return [
    {
      role: "system",
      content: SYSTEM_MESSAGE
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Create a scheduled pre-market daily stock focus report.",
        rules: [
          "Use only provided DB-derived data.",
          "Do not claim certainty.",
          "Do not use outside news.",
          "Do not say buy or sell.",
          "Do not use long entry, short entry, or position advice language.",
          "Use categoryCandidate and reasons as hints, but make your own final bucket choice from the provided metrics.",
          "Keep the alert short by selecting only the top 1-2 total symbols across focus, interesting, and avoid.",
          "Prefer high-risk or unusually large-move symbols; omit normal movement.",
          "Prefer the interesting bucket for asymmetric or unusual movement that deserves human review.",
          "Put ordinary symbols in neutral, but include at most 2 neutral items.",
          "Use exact ticker strings from the input.",
          "For selected symbols, include concrete numbers from the input such as latestPrice, changePercent, dailyHigh, dailyLow, previousClose, rangePercent, and snapshotCount.",
          "Explain the setup, what would confirm it, what would invalidate it, and the main risk.",
          "Use one short sentence per text field.",
          "Use at most 2 evidence items and at most 2 watchLevels items per selected symbol.",
          "Set telegramMessage to an empty string because the app formats the message.",
          "Prefer short practical wording for Telegram."
        ],
        outputSchema: {
          title: "string",
          overallSummary: "string",
          interesting: [
            {
              ticker: "string",
              reason: "string",
              riskLevel: "low | medium | high",
              thesis: "string",
              setup: "string",
              evidence: ["string"],
              watchLevels: ["string"],
              risk: "string",
              actionNote: "string"
            }
          ],
          focus: [
            {
              ticker: "string",
              reason: "string",
              riskLevel: "low | medium | high",
              thesis: "string",
              setup: "string",
              evidence: ["string"],
              watchLevels: ["string"],
              risk: "string",
              actionNote: "string"
            }
          ],
          avoid: [
            {
              ticker: "string",
              reason: "string",
              riskLevel: "low | medium | high",
              thesis: "string",
              setup: "string",
              evidence: ["string"],
              watchLevels: ["string"],
              risk: "string",
              actionNote: "string"
            }
          ],
          neutral: [
            {
              ticker: "string",
              reason: "string"
            }
          ],
          telegramMessage: ""
        },
        data: input
      })
    }
  ];
}
