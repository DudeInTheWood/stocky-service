import type { Quote } from "../../types/quote.js";
import { prisma } from "../../db/prisma.js";
import type { DailyPriceMetricService } from "./daily-price-metric.service.js";

export class PriceSnapshotService {
  constructor(private readonly dailyPriceMetricService?: DailyPriceMetricService) {}

  async storeQuotes(quotes: Quote[]): Promise<number> {
    let storedCount = 0;

    for (const quote of quotes) {
      const symbol = await prisma.symbol.upsert({
        where: {
          ticker: quote.symbol
        },
        update: {
          enabled: true
        },
        create: {
          ticker: quote.symbol,
          enabled: true
        }
      });

      const snapshot = await prisma.priceSnapshot.create({
        data: {
          symbolId: symbol.id,
          price: quote.price,
          currency: quote.currency,
          marketTimestamp: quote.marketTimestamp,
          source: quote.source
        }
      });

      await this.dailyPriceMetricService?.refreshForSnapshot({
        symbolId: snapshot.symbolId,
        fetchedAt: snapshot.fetchedAt
      });

      storedCount += 1;
    }

    return storedCount;
  }
}
