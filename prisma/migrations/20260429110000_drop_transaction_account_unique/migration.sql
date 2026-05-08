-- DropIndex: account_id was unique under the buy-only model (one transaction per account).
-- Renewals create additional transactions per account, so the constraint must go.
DROP INDEX "transactions_account_id_key";
