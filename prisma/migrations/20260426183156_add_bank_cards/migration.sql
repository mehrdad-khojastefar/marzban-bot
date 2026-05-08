-- Idempotent: this migration heals a hole in earlier migration history where
-- bank_cards was added to the schema but no migration created it. Running it
-- against a DB that already has the table (because it was created via
-- `prisma db push` or out-of-band) must be a no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "bank_cards" (
    "id" SERIAL NOT NULL,
    "card_number" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "bank_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_cards_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bank_card_id" INTEGER;

-- AddForeignKey (Postgres lacks IF NOT EXISTS for constraints, so guard with DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_bank_card_id_fkey'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_bank_card_id_fkey"
      FOREIGN KEY ("bank_card_id") REFERENCES "bank_cards"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
