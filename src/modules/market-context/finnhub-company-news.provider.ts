import type { FinnhubConfig } from "../../config/app-config.js";
import type { CompanyNewsProvider, CompanyNewsProviderItem } from "./company-news.provider.js";

interface FinnhubCompanyNewsItem {
  id?: unknown;
  datetime?: unknown;
  headline?: unknown;
  summary?: unknown;
  source?: unknown;
  url?: unknown;
}

export class FinnhubCompanyNewsProvider implements CompanyNewsProvider {
  readonly providerName = "finnhub";
  private readonly baseUrl = "https://finnhub.io/api/v1/company-news";

  constructor(private readonly config: FinnhubConfig) {}

  async fetchCompanyNews(symbol: string, from: string, to: string): Promise<CompanyNewsProviderItem[]> {
    if (!this.config.apiKey) {
      throw new Error("FINNHUB_API_KEY is required for Finnhub company news.");
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("token", this.config.apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Finnhub company news request failed for ${symbol}: ${response.status} ${body}`);
    }

    const body = (await response.json()) as unknown;

    if (!Array.isArray(body)) {
      throw new Error(`Finnhub company news response for ${symbol} was not an array.`);
    }

    return body.filter(isRecord).flatMap((item) => normalizeFinnhubCompanyNewsItem(item));
  }
}

function normalizeFinnhubCompanyNewsItem(item: FinnhubCompanyNewsItem): CompanyNewsProviderItem[] {
  const headline = parseString(item.headline);
  const publishedAt = parseFinnhubTimestamp(item.datetime);

  if (!headline || !publishedAt) {
    return [];
  }

  return [
    {
      externalId: parseExternalId(item.id),
      headline,
      summary: parseString(item.summary),
      source: parseString(item.source),
      url: parseString(item.url),
      publishedAt,
      rawJson: item
    }
  ];
}

function parseExternalId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseFinnhubTimestamp(value: unknown): Date | undefined {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  return new Date(seconds * 1000);
}

function isRecord(value: unknown): value is FinnhubCompanyNewsItem {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
