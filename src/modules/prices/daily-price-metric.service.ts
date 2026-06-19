import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  getDateOnlyInTimezone,
  getUtcRangeForDateInTimezone
} from "../../utils/timezone-date.js";
import { calculateDailyPriceMetric } from "./daily-price-metric.calculator.js";
import type { DailyPriceMetricCache } from "./daily-price-metric-cache.js";

export class DailyPriceMetricService {
  constructor(
    private readonly timezone: string,
    private readonly dailyPriceMetricCache?: DailyPriceMetricCache
  ) {}

  async refreshForSnapshot(snapshot: { symbolId: string; fetchedAt: Date }): Promise<void> {
    const date = getDateOnlyInTimezone(snapshot.fetchedAt, this.timezone);
    const { start, end } = getUtcRangeForDateInTimezone(date, this.timezone);

    const snapshots = await prisma.priceSnapshot.findMany({
      where: {
        symbolId: snapshot.symbolId,
        fetchedAt: {
          gte: start,
          lt: end
        }
      },
      orderBy: {
        fetchedAt: "asc"
      },
      select: {
        price: true,
        fetchedAt: true
      }
    });

    const previousMetric = await prisma.dailyPriceMetric.findFirst({
      where: {
        symbolId: snapshot.symbolId,
        date: {
          lt: date
        }
      },
      orderBy: {
        date: "desc"
      },
      select: {
        closePrice: true
      }
    });

    const metric = calculateDailyPriceMetric(
      snapshots.map((item) => ({
        price: new Prisma.Decimal(item.price),
        fetchedAt: item.fetchedAt
      })),
      previousMetric?.closePrice ? new Prisma.Decimal(previousMetric.closePrice) : null
    );

    if (!metric) {
      return;
    }

    const dailyMetric = await prisma.dailyPriceMetric.upsert({
      where: {
        symbolId_date: {
          symbolId: snapshot.symbolId,
          date
        }
      },
      update: metric,
      create: {
        symbolId: snapshot.symbolId,
        date,
        ...metric
      }
    });

    if (this.dailyPriceMetricCache) {
      const symbol = await prisma.symbol.findUnique({
        where: {
          id: snapshot.symbolId
        },
        select: {
          ticker: true
        }
      });

      if (symbol) {
        this.dailyPriceMetricCache.set({
          symbol: symbol.ticker,
          date: dailyMetric.date,
          highPrice: Number(dailyMetric.highPrice),
          lowPrice: Number(dailyMetric.lowPrice),
          snapshotCount: dailyMetric.snapshotCount
        });
      }
    }
  }
}
