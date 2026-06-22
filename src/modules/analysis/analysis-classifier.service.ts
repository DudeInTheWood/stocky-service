import type { AnalysisInput, AnalysisSymbolInput } from "./analysis-input.service.js";

export type AnalysisCategory = "interesting" | "focus" | "avoid" | "neutral";

export interface ClassifiedAnalysisSymbol extends AnalysisSymbolInput {
  categoryCandidate: AnalysisCategory;
  reasons: string[];
}

export interface ClassifiedAnalysisInput extends Omit<AnalysisInput, "symbols"> {
  symbols: ClassifiedAnalysisSymbol[];
}

export class AnalysisClassifierService {
  classify(input: AnalysisInput): ClassifiedAnalysisInput {
    return {
      ...input,
      symbols: input.symbols.map((symbol) => classifySymbol(symbol))
    };
  }
}

function classifySymbol(symbol: AnalysisSymbolInput): ClassifiedAnalysisSymbol {
  const reasons: string[] = [];
  const changePercent = symbol.changePercent ?? 0;
  const absoluteChange = Math.abs(changePercent);

  if (symbol.dataQuality === "too_few_snapshots") {
    reasons.push("Snapshot count is below the minimum needed for a reliable daily read.");
    return {
      ...symbol,
      categoryCandidate: "avoid",
      reasons
    };
  }

  reasons.push("Snapshot count is enough for analysis.");

  if (symbol.volatilityLabel === "extreme") {
    reasons.push("Daily range is extremely wide relative to the average price.");
    return {
      ...symbol,
      categoryCandidate: "avoid",
      reasons
    };
  }

  if (symbol.positionInRange === "near_high") {
    reasons.push("Price is near the upper part of the daily range.");
  } else if (symbol.positionInRange === "near_low") {
    reasons.push("Price is near the lower part of the daily range.");
  } else if (symbol.positionInRange === "flat") {
    reasons.push("Daily range is flat.");
  } else {
    reasons.push("Price is in the middle of the daily range.");
  }

  if (changePercent > 0) {
    reasons.push("Daily change is positive.");
  } else if (changePercent < 0) {
    reasons.push("Daily change is negative.");
  } else {
    reasons.push("Daily change is flat or unavailable.");
  }

  if (symbol.positionInRange === "near_high" && changePercent >= 3.5) {
    reasons.push("Price may already be extended near the daily high.");
    return {
      ...symbol,
      categoryCandidate: "avoid",
      reasons
    };
  }

  if (changePercent >= 1.5 && symbol.positionInRange === "near_high") {
    reasons.push("Strong positive movement is close to the daily high.");
    return {
      ...symbol,
      categoryCandidate: "interesting",
      reasons
    };
  }

  if (changePercent <= -1.5 && symbol.positionInRange === "near_low") {
    reasons.push("Large negative movement is close to the daily low.");
    return {
      ...symbol,
      categoryCandidate: "interesting",
      reasons
    };
  }

  if (absoluteChange >= 3 || symbol.volatilityLabel === "high") {
    reasons.push("Movement is larger than normal for the watchlist.");
    return {
      ...symbol,
      categoryCandidate: "interesting",
      reasons
    };
  }

  if (changePercent >= 0.75 && symbol.positionInRange === "near_high") {
    reasons.push("Movement is positive without looking too chaotic.");
    return {
      ...symbol,
      categoryCandidate: "focus",
      reasons
    };
  }

  reasons.push("No strong signal from the current daily range.");

  return {
    ...symbol,
    categoryCandidate: "neutral",
    reasons
  };
}
