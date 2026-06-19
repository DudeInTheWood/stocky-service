import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { calculateDailyPriceMetric } from "./daily-price-metric.calculator.js";

describe("calculateDailyPriceMetric", () => {
  it("calculates open, close, high, low, average, and change from daily snapshots", () => {
    const metric = calculateDailyPriceMetric(
      [
        snapshot("101.25", "2026-06-17T09:00:20.000Z"),
        snapshot("99.50", "2026-06-17T09:00:10.000Z"),
        snapshot("100.00", "2026-06-17T09:00:00.000Z")
      ],
      new Prisma.Decimal("98.00")
    );

    assert.ok(metric);
    assert.equal(metric.openPrice.toString(), "100");
    assert.equal(metric.closePrice.toString(), "101.25");
    assert.equal(metric.highPrice.toString(), "101.25");
    assert.equal(metric.lowPrice.toString(), "99.5");
    assert.equal(metric.avgPrice.toString(), "100.25");
    assert.equal(metric.snapshotCount, 3);
    assert.equal(metric.previousClose?.toString(), "98");
    assert.equal(metric.changeAmount?.toString(), "3.25");
    assert.equal(metric.changePercent?.toString(), "3.3163");
    assert.equal(metric.firstSnapshotAt.toISOString(), "2026-06-17T09:00:00.000Z");
    assert.equal(metric.lastSnapshotAt.toISOString(), "2026-06-17T09:00:20.000Z");
  });

  it("returns no metric when there are no snapshots", () => {
    const metric = calculateDailyPriceMetric([], null);

    assert.equal(metric, null);
  });
});

function snapshot(price: string, fetchedAt: string) {
  return {
    price: new Prisma.Decimal(price),
    fetchedAt: new Date(fetchedAt)
  };
}
