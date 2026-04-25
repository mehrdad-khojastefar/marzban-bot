-- CreateEnum
CREATE TYPE "SellerPlanType" AS ENUM ('fixed', 'per_unit');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "price" INTEGER;

-- AlterTable
ALTER TABLE "seller_plans" ADD COLUMN     "type" "SellerPlanType" NOT NULL DEFAULT 'fixed';
