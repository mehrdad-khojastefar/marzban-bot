-- Performance indexes for 10K-user scale. See WORKING.md (Step 1).
--
-- Every column added here is used in a WHERE / ORDER BY / join condition
-- in a per-update or per-request code path. Without these, the bot
-- full-table-scans the hottest queries.
--
-- All statements are idempotent (CREATE INDEX IF NOT EXISTS) so this
-- migration is safe to re-run against a partially-migrated database.

-- accounts: hot lookups by user/seller and by Marzban identity
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx"           ON "accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "accounts_seller_id_idx"         ON "accounts" ("seller_id");
CREATE INDEX IF NOT EXISTS "accounts_marzban_username_idx"  ON "accounts" ("marzban_username");
CREATE INDEX IF NOT EXISTS "accounts_marzban_sub_token_idx" ON "accounts" ("marzban_sub_token");
CREATE INDEX IF NOT EXISTS "accounts_expires_at_idx"        ON "accounts" ("expires_at");
CREATE INDEX IF NOT EXISTS "accounts_seller_id_payment_status_idx"
  ON "accounts" ("seller_id", "payment_status");

-- users: admin pending-approval queue
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" ("status");

-- payments: user history and admin pending-receipt queue
CREATE INDEX IF NOT EXISTS "payments_user_id_idx"        ON "payments" ("user_id");
CREATE INDEX IF NOT EXISTS "payments_status_idx"         ON "payments" ("status");
CREATE INDEX IF NOT EXISTS "payments_user_id_status_idx" ON "payments" ("user_id", "status");

-- transactions: renew/buy reconciliation and per-user state
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx"        ON "transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "transactions_account_id_idx"     ON "transactions" ("account_id");
CREATE INDEX IF NOT EXISTS "transactions_user_id_status_idx" ON "transactions" ("user_id", "status");
