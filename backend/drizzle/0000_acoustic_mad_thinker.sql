CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"threshold_bytes" integer,
	"severity" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"device_id" uuid,
	"threshold_bytes" integer,
	"observed_bytes" integer,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"mac_address" text NOT NULL,
	"hostname" text,
	"vendor" text,
	"is_known" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"measured_at" timestamp with time zone NOT NULL,
	"latency_ms" numeric(10, 3) NOT NULL,
	"download_mbps" numeric(10, 3) NOT NULL,
	"upload_mbps" numeric(10, 3) NOT NULL,
	"uptime_seconds" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"upload_bytes" integer DEFAULT 0 NOT NULL,
	"download_bytes" integer DEFAULT 0 NOT NULL,
	"total_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health" ADD CONSTRAINT "health_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_rules_type_key" ON "alert_rules" USING btree ("type");--> statement-breakpoint
CREATE INDEX "alerts_triggered_at_idx" ON "alerts" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "alerts_acknowledged_at_idx" ON "alerts" USING btree ("acknowledged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_mac_address_key" ON "devices" USING btree ("mac_address");--> statement-breakpoint
CREATE INDEX "devices_ip_address_idx" ON "devices" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "devices_is_known_idx" ON "devices" USING btree ("is_known");--> statement-breakpoint
CREATE INDEX "health_device_id_idx" ON "health" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "health_measured_at_idx" ON "health" USING btree ("measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_device_bucket_key" ON "usage" USING btree ("device_id","bucket_start");--> statement-breakpoint
CREATE INDEX "usage_bucket_start_idx" ON "usage" USING btree ("bucket_start");