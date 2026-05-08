-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('buy', 'renew');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "type" "TransactionType" NOT NULL DEFAULT 'buy';
