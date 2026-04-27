-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'checkout', 'awaiting_receipt', 'awaiting_approval', 'paid', 'provisioning', 'completed', 'failed', 'rejected', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('premzy', 'manual');

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "transaction_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" INTEGER NOT NULL,
    "plan_id" INTEGER,
    "data_limit" BIGINT,
    "duration_days" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "method" "PaymentMethod" NOT NULL,
    "premzy_order_id" TEXT,
    "bank_card_id" INTEGER,
    "receipt_file_id" TEXT,
    "reviewed_by" BIGINT,
    "account_id" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_transaction_id_key" ON "transactions"("transaction_id");
CREATE UNIQUE INDEX "transactions_premzy_order_id_key" ON "transactions"("premzy_order_id");
CREATE UNIQUE INDEX "transactions_account_id_key" ON "transactions"("account_id");
CREATE INDEX "transactions_status_idx" ON "transactions"("status");
CREATE INDEX "transactions_premzy_order_id_idx" ON "transactions"("premzy_order_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_card_id_fkey" FOREIGN KEY ("bank_card_id") REFERENCES "bank_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
