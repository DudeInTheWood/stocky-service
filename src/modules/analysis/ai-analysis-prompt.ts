import type { LlmMessage } from "../llm/llm.provider.js";
import type { ClassifiedAnalysisInput } from "./analysis-classifier.service.js";

const SYSTEM_MESSAGE = [
  "You analyze market attention from structured stock data.",
  "Use only the provided data.",
  "Do not provide financial advice.",
  "Do not recommend buy or sell.",
  "Do not predict whether a symbol will go up or down.",
  "Explain which symbols deserve attention today and why.",
  "Classify selected symbols as highAttention, watchlist, avoidChasing, or lowSignal.",
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
        task: "Create a scheduled pre-market market-attention report.",
        rules: [
          "Use only provided DB-derived price, news, and fundamental factors.",
          "Do not claim certainty.",
          "Do not use outside news.",
          "Do not say buy or sell.",
          "Do not use enter, exit, long entry, short entry, or position advice language.",
          "Use categoryCandidate, attentionScore, and attentionReasons as hints, but make your own final bucket choice from the provided factors.",
          "Keep the alert short by selecting only the top 1-2 total symbols across highAttention, watchlist, and avoidChasing.",
          "Prefer symbols with multiple attention drivers or noisy large moves; omit ordinary movement.",
          "Use highAttention for symbols where price, news, fundamentals, or data quality clearly increased attention.",
          "Use watchlist for moderate attention that needs confirmation.",
          "Use avoidChasing for noisy or stretched moves where attention is high but signal quality is poor.",
          "Put quiet symbols in lowSignal, but include at most 2 lowSignal items.",
          "Use exact ticker strings from the input.",
          "For selected symbols, include concrete factors from the input such as attentionScore, changePercent, volatilityLabel, newsCount, recencyLabel, and valuationLabel.",
          "When news is an attention driver, include one short evidence sentence naming the headline or news flow that makes the symbol worth attention.",
          "Keep wording observational: worth monitoring, attention increased, news flow is active, valuation context is elevated, needs confirmation, avoid chasing.",
          "Use one short sentence per text field.",
          "Use at most 2 evidence items and at most 2 watchLevels items per selected symbol.",
          "Set telegramMessage to an empty string because the app formats the message.",
          "Prefer short practical wording for Telegram."
        ],
        outputSchema: {
          title: "string",
          overallSummary: "string",
          highAttention: [
            {
              ticker: "string",
              reason: "string",
              attentionDrivers: ["price | news | fundamentals | data_quality"],
              riskContext: "string",
              riskLevel: "low | medium | high",
              evidence: ["string"],
              watchLevels: ["string"]
            }
          ],
          watchlist: [
            {
              ticker: "string",
              reason: "string",
              attentionDrivers: ["price | news | fundamentals | data_quality"],
              riskContext: "string",
              riskLevel: "low | medium | high",
              evidence: ["string"],
              watchLevels: ["string"]
            }
          ],
          avoidChasing: [
            {
              ticker: "string",
              reason: "string",
              attentionDrivers: ["price | news | fundamentals | data_quality"],
              riskContext: "string",
              riskLevel: "low | medium | high",
              evidence: ["string"],
              watchLevels: ["string"]
            }
          ],
          lowSignal: [
            {
              ticker: "string",
              reason: "string",
              attentionDrivers: ["price | news | fundamentals | data_quality"]
            }
          ],
          telegramMessage: ""
        },
        data: input
      })
    }
  ];
}
