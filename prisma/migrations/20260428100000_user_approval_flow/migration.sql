-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'approved', 'banned');

-- AlterTable: Add status to users (default pending, but set existing users to approved)
ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'pending';
UPDATE "users" SET "status" = 'approved';

-- CreateTable: Many-to-many junction for User ↔ BankCard
CREATE TABLE "_UserBankCards" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_UserBankCards_A_fkey" FOREIGN KEY ("A") REFERENCES "bank_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_UserBankCards_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_UserBankCards_AB_unique" ON "_UserBankCards"("A", "B");
CREATE INDEX "_UserBankCards_B_index" ON "_UserBankCards"("B");
