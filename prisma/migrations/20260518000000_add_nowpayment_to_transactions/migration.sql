-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'nowpayment';

-- AlterTable
ALTER TABLE "transactions"
  ADD COLUMN "nowpayment_invoice_id"  TEXT,
  ADD COLUMN "nowpayment_payment_id"  TEXT,
  ADD COLUMN "nowpayment_invoice_url" TEXT,
  ADD COLUMN "pay_currency"           TEXT,
  ADD COLUMN "usd_amount"             DECIMAL(12, 2),
  ADD COLUMN "fx_rate"                DECIMAL(18, 4),
  ADD COLUMN "fx_source"              TEXT,
  ADD COLUMN "fx_fetched_at"          TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_nowpayment_invoice_id_key" ON "transactions"("nowpayment_invoice_id");
CREATE UNIQUE INDEX "transactions_nowpayment_payment_id_key" ON "transactions"("nowpayment_payment_id");
CREATE INDEX "transactions_nowpayment_payment_id_idx" ON "transactions"("nowpayment_payment_id");
