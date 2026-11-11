-- LOG-002/LOG-004/LOG-005: shipments created through the Tembus logistic providers
CREATE TABLE IF NOT EXISTS "shipments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "provider" varchar(50) NOT NULL,
  "mode" varchar(20) NOT NULL,
  "service" varchar(50),
  "awb" varchar(100) NOT NULL UNIQUE,
  "status" varchar(50) NOT NULL DEFAULT 'created',
  "cost" numeric(12, 2) DEFAULT '0',
  "label_url" text,
  "tracking_url" text,
  "delivery_instructions" text,
  "tracking_history" jsonb,
  "raw_response" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "shipments_order_idx" ON "shipments" ("order_id");
CREATE INDEX IF NOT EXISTS "shipments_awb_idx" ON "shipments" ("awb");
