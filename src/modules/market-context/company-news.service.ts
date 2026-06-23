import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import type { CompanyNewsProvider, CompanyNewsProviderItem } from "./company-news.provider.js";

export interface RefreshCompanyNewsOptions {
  symbols: string[];
  from: Date;
  to: Date;
  maxItemsPerSymbol: number;
}

export interface RefreshCompanyNewsResult {
  fetchedSymbols: number;
  storedItems: number;
  failedSymbols: string[];
}

export class CompanyNewsService {
  constructor(private readonly provider: CompanyNewsProvider) {}

  async refreshCompanyNews(options: RefreshCompanyNewsOptions): Promise<RefreshCompanyNewsResult> {
    const symbolRows = await prisma.symbol.findMany({
      where: {
        ticker: {
          in: options.symbols
        },
        enabled: true
      }
    });
    const from = toDateString(options.from);
    const to = toDateString(options.to);
    let fetchedSymbols = 0;
    let storedItems = 0;
    const failedSymbols: string[] = [];

    for (const symbol of symbolRows) {
      try {
        const items = await this.provider.fetchCompanyNews(symbol.ticker, from, to);
        const limitedItems = items
          .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime())
          .slice(0, options.maxItemsPerSymbol);

        for (const item of limitedItems) {
          await this.upsertCompanyNewsItem(symbol.id, symbol.ticker, item);
          storedItems += 1;
        }

        fetchedSymbols += 1;
      } catch (error) {
        failedSymbols.push(symbol.ticker);
        console.error(`Company news refresh failed for ${symbol.ticker}.`, error);
      }
    }

    return {
      fetchedSymbols,
      storedItems,
      failedSymbols
    };
  }

  private async upsertCompanyNewsItem(
    symbolId: string,
    ticker: string,
    item: CompanyNewsProviderItem
  ): Promise<void> {
    const externalId =
      item.externalId ?? createDeterministicNewsId(this.provider.providerName, ticker, item);
    const rawJson = JSON.stringify(item.rawJson);

    await prisma.$executeRaw`
      INSERT INTO "company_news_items" (
        "id",
        "symbol_id",
        "external_id",
        "headline",
        "summary",
        "source",
        "url",
        "published_at",
        "provider",
        "raw_json"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${symbolId}::uuid,
        ${externalId},
        ${item.headline},
        ${item.summary ?? null},
        ${item.source ?? null},
        ${item.url ?? null},
        ${item.publishedAt},
        ${this.provider.providerName},
        ${rawJson}::jsonb
      )
      ON CONFLICT ("provider", "external_id")
      DO UPDATE SET
        "headline" = EXCLUDED."headline",
        "summary" = EXCLUDED."summary",
        "source" = EXCLUDED."source",
        "url" = EXCLUDED."url",
        "published_at" = EXCLUDED."published_at",
        "fetched_at" = CURRENT_TIMESTAMP,
        "raw_json" = EXCLUDED."raw_json"
    `;
  }
}

function createDeterministicNewsId(
  provider: string,
  ticker: string,
  item: CompanyNewsProviderItem
): string {
  return createHash("sha256")
    .update([provider, ticker, item.headline, item.url ?? "", item.publishedAt.toISOString()].join("|"))
    .digest("hex")
    .slice(0, 64);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
