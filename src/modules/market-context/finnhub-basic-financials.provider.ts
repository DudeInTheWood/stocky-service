import type { FinnhubConfig } from "../../config/app-config.js";
import type {
  BasicFinancialsProvider,
  BasicFinancialsProviderResult
} from "./basic-financials.provider.js";

interface FinnhubMetricResponse {
  metric?: unknown;
}

export class FinnhubBasicFinancialsProvider implements BasicFinancialsProvider {
  readonly providerName = "finnhub";
  private readonly baseUrl = "https://finnhub.io/api/v1/stock/metric";

  constructor(private readonly config: FinnhubConfig) {}

  async fetchBasicFinancials(symbol: string): Promise<BasicFinancialsProviderResult> {
    if (!this.config.apiKey) {
      throw new Error("FINNHUB_API_KEY is required for Finnhub basic financials.");
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("metric", "all");
    url.searchParams.set("token", this.config.apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Finnhub basic financials request failed for ${symbol}: ${response.status} ${body}`
      );
    }

    const body = (await response.json()) as FinnhubMetricResponse;

    if (!isRecord(body.metric)) {
      throw new Error(`Finnhub basic financials response for ${symbol} did not include metrics.`);
    }

    return {
      metricJson: body.metric
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
