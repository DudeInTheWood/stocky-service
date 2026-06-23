import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import type { BasicFinancialsProvider } from "./basic-financials.provider.js";

export interface RefreshBasicFinancialsOptions {
  symbols: string[];
  refreshHours: number;
}

export interface RefreshBasicFinancialsResult {
  fetchedSymbols: number;
  skippedSymbols: number;
  failedSymbols: string[];
}

export class BasicFinancialsService {
  constructor(private readonly provider: BasicFinancialsProvider) {}

  async refreshBasicFinancials(
    options: RefreshBasicFinancialsOptions
  ): Promise<RefreshBasicFinancialsResult> {
    const symbolRows = await prisma.symbol.findMany({
      where: {
        ticker: {
          in: options.symbols
        },
        enabled: true
      },
      include: {
        basicFinancials: {
          where: {
            provider: this.provider.providerName
          },
          take: 1
        }
      }
    });
    let fetchedSymbols = 0;
    let skippedSymbols = 0;
    const failedSymbols: string[] = [];

    for (const symbol of symbolRows) {
      const latestFinancials = symbol.basicFinancials[0];

      if (latestFinancials && !isStale(latestFinancials.fetchedAt, options.refreshHours)) {
        skippedSymbols += 1;
        continue;
      }

      try {
        const financials = await this.provider.fetchBasicFinancials(symbol.ticker);
        await this.upsertBasicFinancials(symbol.id, financials.metricJson);
        fetchedSymbols += 1;
      } catch (error) {
        failedSymbols.push(symbol.ticker);
        console.error(`Basic financials refresh failed for ${symbol.ticker}.`, error);
      }
    }

    return {
      fetchedSymbols,
      skippedSymbols,
      failedSymbols
    };
  }

  private async upsertBasicFinancials(
    symbolId: string,
    metricJsonValue: Record<string, unknown>
  ): Promise<void> {
    const metricJson = JSON.stringify(metricJsonValue);

    await prisma.$executeRaw`
      INSERT INTO "company_basic_financials" (
        "id",
        "symbol_id",
        "provider",
        "metric_json"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${symbolId}::uuid,
        ${this.provider.providerName},
        ${metricJson}::jsonb
      )
      ON CONFLICT ("symbol_id", "provider")
      DO UPDATE SET
        "metric_json" = EXCLUDED."metric_json",
        "fetched_at" = CURRENT_TIMESTAMP
    `;
  }
}

function isStale(fetchedAt: Date, refreshHours: number): boolean {
  const refreshMs = refreshHours * 60 * 60 * 1000;
  return Date.now() - fetchedAt.getTime() >= refreshMs;
}
