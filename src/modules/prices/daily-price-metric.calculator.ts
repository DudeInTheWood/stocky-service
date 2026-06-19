import { Prisma } from "@prisma/client";

export interface DailyPriceMetricSnapshotInput {
  price: Prisma.Decimal;
  fetchedAt: Date;
}

export interface DailyPriceMetricCalculation {
  openPrice: Prisma.Decimal;
  closePrice: Prisma.Decimal;
  highPrice: Prisma.Decimal;
  lowPrice: Prisma.Decimal;
  avgPrice: Prisma.Decimal;
  snapshotCount: number;
  previousClose: Prisma.Decimal | null;
  changeAmount: Prisma.Decimal | null;
  changePercent: Prisma.Decimal | null;
  firstSnapshotAt: Date;
  lastSnapshotAt: Date;
}

export function calculateDailyPriceMetric(
  snapshots: DailyPriceMetricSnapshotInput[],
  previousClose: Prisma.Decimal | null
): DailyPriceMetricCalculation | null {
  if (snapshots.length === 0) {
    return null;
  }

  const orderedSnapshots = [...snapshots].sort(
    (left, right) => left.fetchedAt.getTime() - right.fetchedAt.getTime()
  );

  const firstSnapshot = orderedSnapshots[0];
  const lastSnapshot = orderedSnapshots[orderedSnapshots.length - 1];
  let highPrice = firstSnapshot.price;
  let lowPrice = firstSnapshot.price;
  let totalPrice = new Prisma.Decimal(0);

  for (const snapshot of orderedSnapshots) {
    if (snapshot.price.gt(highPrice)) {
      highPrice = snapshot.price;
    }

    if (snapshot.price.lt(lowPrice)) {
      lowPrice = snapshot.price;
    }

    totalPrice = totalPrice.plus(snapshot.price);
  }

  const closePrice = lastSnapshot.price;
  const changeAmount = previousClose ? closePrice.minus(previousClose) : null;
  const changePercent =
    previousClose && !previousClose.equals(0)
      ? changeAmount?.div(previousClose).mul(100).toDecimalPlaces(4) ?? null
      : null;

  return {
    openPrice: firstSnapshot.price,
    closePrice,
    highPrice,
    lowPrice,
    avgPrice: totalPrice.div(orderedSnapshots.length).toDecimalPlaces(4),
    snapshotCount: orderedSnapshots.length,
    previousClose,
    changeAmount,
    changePercent,
    firstSnapshotAt: firstSnapshot.fetchedAt,
    lastSnapshotAt: lastSnapshot.fetchedAt
  };
}
