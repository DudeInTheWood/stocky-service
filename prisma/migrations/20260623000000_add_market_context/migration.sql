CREATE TABLE "company_news_items" (
    "id" UUID NOT NULL,
    "symbol_id" UUID NOT NULL,
    "external_id" VARCHAR(120),
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "source" VARCHAR(120),
    "url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" VARCHAR(50) NOT NULL,
    "raw_json" JSONB,

    CONSTRAINT "company_news_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_basic_financials" (
    "id" UUID NOT NULL,
    "symbol_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "metric_json" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_basic_financials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_news_items_provider_external_id_key" ON "company_news_items"("provider", "external_id");
CREATE INDEX "company_news_items_symbol_id_published_at_idx" ON "company_news_items"("symbol_id", "published_at");
CREATE INDEX "company_news_items_published_at_idx" ON "company_news_items"("published_at");
CREATE UNIQUE INDEX "company_basic_financials_symbol_id_provider_key" ON "company_basic_financials"("symbol_id", "provider");
CREATE INDEX "company_basic_financials_fetched_at_idx" ON "company_basic_financials"("fetched_at");

ALTER TABLE "company_news_items" ADD CONSTRAINT "company_news_items_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_basic_financials" ADD CONSTRAINT "company_basic_financials_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
