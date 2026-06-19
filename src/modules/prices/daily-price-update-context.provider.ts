import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type {
  PriceUpdateContext,
  PriceUpdateContextProvider
} from "../notifications/price-update-context.provider.js";
import type { Quote } from "../../types/quote.js";
import { getDateOnlyInTimezone } from "../../utils/timezone-date.js";

export class DailyPriceUpdateContextProvider implements PriceUpdateContextProvider {
  constructor(private readonly timezone: string) {}

  async getPriceUpdateContext(quote: Quote): Promise<PriceUpdateContext | null> {
    const date = getDateOnlyInTimezone(new Date(), this.timezone);
    const metric = await prisma.dailyPriceMetric.findFirst({
      where: {
        date,
        symbol: {
          ticker: quote.symbol
        }
      },
      select: {
        highPrice: true,
        lowPrice: true,
        snapshotCount: true
      }
    });

    if (!metric) {
      return {
        dailyHighPrice: quote.price,
        dailyLowPrice: quote.price,
        snapshotCount: 0
      };
    }

    return {
      dailyHighPrice: Math.max(toNumber(metric.highPrice), quote.price),
      dailyLowPrice: Math.min(toNumber(metric.lowPrice), quote.price),
      snapshotCount: metric.snapshotCount
    };
  }
}

function toNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}
