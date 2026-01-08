-- AddBalanceConstraints
-- This migration adds CHECK constraints to prevent negative wallet balances
-- IMPORTANT: Run check_negative_balances.sql BEFORE applying this migration

-- Add constraint to prevent negative balance
ALTER TABLE "Wallet" ADD CONSTRAINT "check_balance_non_negative"
  CHECK (balance >= 0);

-- Add constraint to prevent negative escrow balance
ALTER TABLE "Wallet" ADD CONSTRAINT "check_escrow_non_negative"
  CHECK ("escrowBalance" >= 0);

-- Create index for performance optimization on wallet lookups
CREATE INDEX IF NOT EXISTS "idx_wallet_user_id" ON "Wallet"("userId");
