CREATE TABLE "daily_price_metrics" (
    "id" UUID NOT NULL,
    "symbol_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "open_price" DECIMAL(18,4) NOT NULL,
    "close_price" DECIMAL(18,4) NOT NULL,
    "high_price" DECIMAL(18,4) NOT NULL,
    "low_price" DECIMAL(18,4) NOT NULL,
    "avg_price" DECIMAL(18,4) NOT NULL,
    "snapshot_count" INTEGER NOT NULL,
    "previous_close" DECIMAL(18,4),
    "change_amount" DECIMAL(18,4),
    "change_percent" DECIMAL(10,4),
    "first_snapshot_at" TIMESTAMP(3) NOT NULL,
    "last_snapshot_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_price_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_price_metrics_symbol_id_date_key" ON "daily_price_metrics"("symbol_id", "date");
CREATE INDEX "daily_price_metrics_date_idx" ON "daily_price_metrics"("date");
CREATE INDEX "daily_price_metrics_symbol_id_date_idx" ON "daily_price_metrics"("symbol_id", "date");

ALTER TABLE "daily_price_metrics" ADD CONSTRAINT "daily_price_metrics_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
