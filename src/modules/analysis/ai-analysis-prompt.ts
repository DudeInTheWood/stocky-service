import type { LlmMessage } from "../llm/llm.provider.js";
import type { ClassifiedAnalysisInput } from "./analysis-classifier.service.js";

const SYSTEM_MESSAGE = [
  "You analyze stock price movement from structured data.",
  "Use only the provided data.",
  "Do not provide financial advice.",
  "Do not recommend buy or sell.",
  "Classify symbols as interesting, focus, avoid, or neutral.",
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
          "Explain why each symbol is interesting, avoid, focus, or neutral.",
          "Prefer short practical wording for Telegram."
        ],
        outputSchema: {
          title: "string",
          overallSummary: "string",
          interesting: [
            {
              ticker: "string",
              reason: "string",
              riskLevel: "low | medium | high"
            }
          ],
          focus: [
            {
              ticker: "string",
              reason: "string",
              riskLevel: "low | medium | high"
            }
          ],
          avoid: [
            {
              ticker: "string",
              reason: "string",
              riskLevel: "low | medium | high"
            }
          ],
          neutral: [
            {
              ticker: "string",
              reason: "string"
            }
          ],
          telegramMessage: "string"
        },
        data: input
      })
    }
  ];
}
