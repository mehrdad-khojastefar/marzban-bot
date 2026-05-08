-- Idempotent drift cleanup. Brings any DB whose history diverged from
-- schema.prisma into the canonical state: _UserBankCards uses a PK instead
-- of a unique index, payments.plan_id_fkey has ON DELETE SET NULL, and
-- transactions.transaction_id has no DB-side default (UUIDs come from the app).

-- _UserBankCards: ensure PK exists, drop legacy unique index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = '_UserBankCards_AB_pkey'
  ) THEN
    ALTER TABLE "_UserBankCards" ADD CONSTRAINT "_UserBankCards_AB_pkey" PRIMARY KEY ("A", "B");
  END IF;
END$$;

DROP INDEX IF EXISTS "_UserBankCards_AB_unique";

-- transactions.transaction_id: drop DB-side default if present (no-op if absent)
ALTER TABLE "transactions" ALTER COLUMN "transaction_id" DROP DEFAULT;

-- payments_plan_id_fkey: re-create with ON DELETE SET NULL
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_plan_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
