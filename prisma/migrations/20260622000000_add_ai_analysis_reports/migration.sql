CREATE TABLE "ai_analysis_reports" (
    "id" UUID NOT NULL,
    "symbol_id" UUID,
    "ticker" VARCHAR(40),
    "report_type" VARCHAR(40) NOT NULL,
    "timeframe" VARCHAR(20) NOT NULL,
    "input_json" JSONB NOT NULL,
    "output_json" JSONB,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL,
    "category" VARCHAR(30),
    "risk_level" VARCHAR(30),
    "confidence" DECIMAL(5,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_analysis_reports_symbol_id_timeframe_created_at_idx" ON "ai_analysis_reports"("symbol_id", "timeframe", "created_at");
CREATE INDEX "ai_analysis_reports_report_type_created_at_idx" ON "ai_analysis_reports"("report_type", "created_at");

ALTER TABLE "ai_analysis_reports" ADD CONSTRAINT "ai_analysis_reports_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
