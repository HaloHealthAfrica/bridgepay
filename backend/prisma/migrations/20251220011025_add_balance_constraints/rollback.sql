-- Rollback Script for Balance Constraints Migration
-- Use this if you need to revert the constraints

-- Drop balance constraints
ALTER TABLE "Wallet" DROP CONSTRAINT IF EXISTS "check_balance_non_negative";
ALTER TABLE "Wallet" DROP CONSTRAINT IF EXISTS "check_escrow_non_negative";

-- Drop index (optional - keeping it won't hurt performance)
DROP INDEX IF EXISTS "idx_wallet_user_id";
