CREATE TABLE IF NOT EXISTS "general_charges" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "amount" integer NOT NULL DEFAULT 0,
  "expense_date" text NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_general_charges_store_date" ON "general_charges" ("store_id", "expense_date");
