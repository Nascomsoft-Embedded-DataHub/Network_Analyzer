DROP INDEX "health_measured_at_idx";--> statement-breakpoint
DROP INDEX "usage_bucket_start_idx";--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "threshold_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "alerts" ALTER COLUMN "threshold_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "alerts" ALTER COLUMN "observed_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "usage" ALTER COLUMN "upload_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "usage" ALTER COLUMN "download_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "usage" ALTER COLUMN "total_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_rx_bytes" bigint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_tx_bytes" bigint;--> statement-breakpoint
CREATE INDEX "health_measured_at_brin_idx" ON "health" USING brin ("measured_at");--> statement-breakpoint
CREATE INDEX "usage_bucket_start_brin_idx" ON "usage" USING brin ("bucket_start");