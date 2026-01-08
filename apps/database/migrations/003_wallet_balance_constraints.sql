-- Migration: Add wallet balance constraints and race condition prevention
-- Date: 2026-01-07
-- Purpose: Prevent negative balances and add additional safety constraints

-- Add check constraint to prevent negative balances
ALTER TABLE wallets 
ADD CONSTRAINT positive_balance_check 
CHECK (balance >= 0);

-- Add index on wallet_id for faster locking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallets_id_balance 
ON wallets (id, balance);

-- Add index on wallet_ledger ref for faster conflict resolution
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_ledger_ref 
ON wallet_ledger (ref);

-- Add index on wallet_ledger wallet_id for faster queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_ledger_wallet_id_created 
ON wallet_ledger (wallet_id, created_at DESC);

-- Add balance_after column if it doesn't exist (for audit trail)
ALTER TABLE wallet_ledger 
ADD COLUMN IF NOT EXISTS balance_after DECIMAL(15,2);

-- Add posted_at column if it doesn't exist (for timing audit)
ALTER TABLE wallet_ledger 
ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE;

-- Create function to validate wallet operations
CREATE OR REPLACE FUNCTION validate_wallet_operation()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure balance never goes negative
    IF NEW.balance < 0 THEN
        RAISE EXCEPTION 'Wallet balance cannot be negative. Current: %, Attempted: %', 
            OLD.balance, NEW.balance;
    END IF;
    
    -- Log large balance changes for monitoring
    IF ABS(NEW.balance - COALESCE(OLD.balance, 0)) >= 100000 THEN
        INSERT INTO audit_logs (user_id, action, metadata, created_at)
        VALUES (
            NEW.user_id,
            'large_balance_change',
            json_build_object(
                'wallet_id', NEW.id,
                'old_balance', OLD.balance,
                'new_balance', NEW.balance,
                'change', NEW.balance - COALESCE(OLD.balance, 0),
                'currency', NEW.currency
            ),
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for wallet balance validation
DROP TRIGGER IF EXISTS wallet_balance_validation ON wallets;
CREATE TRIGGER wallet_balance_validation
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION validate_wallet_operation();

-- Add comment for documentation
COMMENT ON CONSTRAINT positive_balance_check ON wallets IS 
'Prevents negative wallet balances as additional safety measure against race conditions';

COMMENT ON FUNCTION validate_wallet_operation() IS 
'Validates wallet operations and logs large balance changes for monitoring';