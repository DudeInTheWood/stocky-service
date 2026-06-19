CREATE TABLE "symbols" (
    "id" UUID NOT NULL,
    "ticker" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "symbols_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_snapshots" (
    "id" UUID NOT NULL,
    "symbol_id" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "market_timestamp" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) NOT NULL,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL,
    "symbol_id" UUID NOT NULL,
    "buy_below" DECIMAL(18,4),
    "sell_above" DECIMAL(18,4),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_events" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "symbols_ticker_key" ON "symbols"("ticker");
CREATE INDEX "price_snapshots_symbol_id_fetched_at_idx" ON "price_snapshots"("symbol_id", "fetched_at");
CREATE INDEX "alert_rules_symbol_id_enabled_idx" ON "alert_rules"("symbol_id", "enabled");
CREATE INDEX "alert_events_rule_id_sent_at_idx" ON "alert_events"("rule_id", "sent_at");

ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "price_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
