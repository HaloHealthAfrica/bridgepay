-- Migration: QR Code Security Enhancements
-- Date: 2026-01-07
-- Purpose: Add constraints and indexes to prevent QR code security issues

-- Add unique constraint on QR code to prevent duplicates
ALTER TABLE qr_codes 
ADD CONSTRAINT unique_qr_code 
UNIQUE (code);

-- Add index for faster QR code lookups with status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qr_codes_code_status 
ON qr_codes (code, status);

-- Add index for QR code expiration cleanup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qr_codes_expires_at_status 
ON qr_codes (expires_at, status) 
WHERE expires_at IS NOT NULL;

-- Add check constraint for valid QR code status
ALTER TABLE qr_codes 
ADD CONSTRAINT valid_qr_status 
CHECK (status IN ('active', 'used', 'expired', 'cancelled'));

-- Add check constraint for valid QR code mode
ALTER TABLE qr_codes 
ADD CONSTRAINT valid_qr_mode 
CHECK (mode IN ('pay', 'receive'));

-- Create function to automatically expire old QR codes
CREATE OR REPLACE FUNCTION expire_old_qr_codes()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE qr_codes 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active' 
      AND expires_at IS NOT NULL 
      AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log the cleanup operation
    IF expired_count > 0 THEN
        INSERT INTO audit_logs (user_id, action, metadata, created_at)
        VALUES (
            NULL,
            'qr_codes_expired',
            json_build_object('expired_count', expired_count),
            NOW()
        );
    END IF;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate QR code operations
CREATE OR REPLACE FUNCTION validate_qr_operation()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent status changes from 'used' back to 'active' (except for failed payments)
    IF OLD.status = 'used' AND NEW.status = 'active' THEN
        -- Allow revert only if it's within 5 minutes (for failed payment recovery)
        IF NEW.updated_at - OLD.updated_at > INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'Cannot reactivate QR code after 5 minutes of being used';
        END IF;
    END IF;
    
    -- Log QR code usage for security monitoring
    IF OLD.status = 'active' AND NEW.status = 'used' THEN
        INSERT INTO audit_logs (user_id, action, metadata, created_at)
        VALUES (
            (NEW.metadata->>'creator_user_id')::UUID,
            'qr_code_used',
            json_build_object(
                'qr_code', NEW.code,
                'amount', NEW.amount,
                'currency', NEW.currency,
                'mode', NEW.mode
            ),
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for QR code validation
DROP TRIGGER IF EXISTS qr_code_validation ON qr_codes;
CREATE TRIGGER qr_code_validation
    BEFORE UPDATE ON qr_codes
    FOR EACH ROW
    EXECUTE FUNCTION validate_qr_operation();

-- Add comments for documentation
COMMENT ON CONSTRAINT unique_qr_code ON qr_codes IS 
'Ensures QR codes are unique to prevent enumeration attacks';

COMMENT ON CONSTRAINT valid_qr_status ON qr_codes IS 
'Validates QR code status transitions';

COMMENT ON FUNCTION expire_old_qr_codes() IS 
'Automatically expires QR codes past their expiration time';

COMMENT ON FUNCTION validate_qr_operation() IS 
'Validates QR code operations and prevents unauthorized status changes';