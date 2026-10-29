DROP INDEX "devices_mac_address_key";--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "mac_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "identity_key" text;--> statement-breakpoint
UPDATE "devices" SET "identity_key" = 'mac:' || "mac_address" WHERE "identity_key" IS NULL;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "identity_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_identity_key_key" ON "devices" USING btree ("identity_key");--> statement-breakpoint
CREATE INDEX "devices_mac_address_idx" ON "devices" USING btree ("mac_address");