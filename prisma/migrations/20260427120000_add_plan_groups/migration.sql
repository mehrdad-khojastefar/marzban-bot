-- CreateEnum
CREATE TYPE "PlanGroupType" AS ENUM ('per_gb', 'fixed');

-- CreateTable
CREATE TABLE "plan_groups" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PlanGroupType" NOT NULL,
    "price_per_gb" INTEGER,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_groups_code_key" ON "plan_groups"("code");

-- AlterTable: Add plan_group_id to users
ALTER TABLE "users" ADD COLUMN "plan_group_id" INTEGER;

-- AlterTable: Add group_id to plans (nullable first for existing rows)
ALTER TABLE "plans" ADD COLUMN "group_id" INTEGER;

-- AlterTable: Add bank_card_id and data_limit to payments, make plan_id nullable
ALTER TABLE "payments" ADD COLUMN "bank_card_id" INTEGER;
ALTER TABLE "payments" ADD COLUMN "data_limit" BIGINT;
ALTER TABLE "payments" ALTER COLUMN "plan_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_plan_group_id_fkey" FOREIGN KEY ("plan_group_id") REFERENCES "plan_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "plan_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_card_id_fkey" FOREIGN KEY ("bank_card_id") REFERENCES "bank_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
