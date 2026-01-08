-- Security Enhancement Migration
-- Adds security monitoring and audit tables

-- ============================================================================
-- SECURITY MONITORING TABLES
-- ============================================================================

-- Security events table
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES auth_users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    endpoint TEXT,
    threat_level TEXT NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_ip_address ON security_events(ip_address);
CREATE INDEX idx_security_events_threat_level ON security_events(threat_level);
CREATE INDEX idx_security_events_created_at ON security_events(created_at DESC);

-- Security alerts table
CREATE TABLE IF NOT EXISTS security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    threat_level TEXT NOT NULL,
    user_id UUID REFERENCES auth_users(id) ON DELETE SET NULL,
    ip_address INET,
    details JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'false_positive'
    assigned_to UUID REFERENCES auth_users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_security_alerts_status ON security_alerts(status);
CREATE INDEX idx_security_alerts_threat_level ON security_alerts(threat_level);
CREATE INDEX idx_security_alerts_created_at ON security_alerts(created_at DESC);

-- Blocked IPs table
CREATE TABLE IF NOT EXISTS blocked_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    blocked_by UUID REFERENCES auth_users(id) ON DELETE SET NULL,
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_permanent BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_blocked_ips_ip_address ON blocked_ips(ip_address);
CREATE INDEX idx_blocked_ips_expires_at ON blocked_ips(expires_at);

-- ============================================================================
-- ENHANCED AUDIT TABLES
-- ============================================================================

-- Add columns to existing audit_logs table
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

-- ============================================================================
-- USER SECURITY ENHANCEMENTS
-- ============================================================================

-- Add security columns to auth_users table
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS lock_reason TEXT;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMPTZ;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_ip INET;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;

-- Add indexes for security columns
CREATE INDEX IF NOT EXISTS idx_auth_users_account_locked ON auth_users(account_locked);
CREATE INDEX IF NOT EXISTS idx_auth_users_last_login_ip ON auth_users(last_login_ip);
CREATE INDEX IF NOT EXISTS idx_auth_users_two_factor_enabled ON auth_users(two_factor_enabled);

-- ============================================================================
-- TRANSACTION SECURITY ENHANCEMENTS
-- ============================================================================

-- Add security columns to payment_intents table
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) DEFAULT 0;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]';
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS aml_status TEXT DEFAULT 'pending'; -- 'pending', 'approved', 'flagged', 'blocked'
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS aml_checked_at TIMESTAMPTZ;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS aml_checked_by UUID REFERENCES auth_users(id);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Add indexes for security columns
CREATE INDEX IF NOT EXISTS idx_payment_intents_risk_score ON payment_intents(risk_score);
CREATE INDEX IF NOT EXISTS idx_payment_intents_aml_status ON payment_intents(aml_status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_ip_address ON payment_intents(ip_address);

-- ============================================================================
-- COMPLIANCE TABLES
-- ============================================================================

-- AML monitoring table
CREATE TABLE IF NOT EXISTS aml_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE,
    monitoring_type TEXT NOT NULL, -- 'daily_limit', 'large_transaction', 'suspicious_pattern', 'velocity_check'
    amount NUMERIC(19, 4),
    currency TEXT DEFAULT 'KES',
    risk_score NUMERIC(5,2) DEFAULT 0,
    risk_factors JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'flagged', 'escalated'
    reviewed_by UUID REFERENCES auth_users(id),
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_aml_monitoring_user_id ON aml_monitoring(user_id);
CREATE INDEX idx_aml_monitoring_transaction_id ON aml_monitoring(transaction_id);
CREATE INDEX idx_aml_monitoring_status ON aml_monitoring(status);
CREATE INDEX idx_aml_monitoring_created_at ON aml_monitoring(created_at DESC);

-- Suspicious activity reports table
CREATE TABLE IF NOT EXISTS suspicious_activity_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL, -- 'unusual_pattern', 'large_cash', 'rapid_movement', 'structuring'
    description TEXT NOT NULL,
    amount_involved NUMERIC(19, 4),
    currency TEXT DEFAULT 'KES',
    time_period_start TIMESTAMPTZ,
    time_period_end TIMESTAMPTZ,
    related_transactions JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'submitted', 'acknowledged'
    submitted_to TEXT, -- Regulatory body
    submitted_at TIMESTAMPTZ,
    reference_number TEXT,
    created_by UUID NOT NULL REFERENCES auth_users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sar_user_id ON suspicious_activity_reports(user_id);
CREATE INDEX idx_sar_status ON suspicious_activity_reports(status);
CREATE INDEX idx_sar_created_at ON suspicious_activity_reports(created_at DESC);

-- ============================================================================
-- TRANSACTION LIMITS TABLE
-- ============================================================================

-- User transaction limits table
CREATE TABLE IF NOT EXISTS user_transaction_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'KES',
    daily_limit NUMERIC(19, 4) NOT NULL DEFAULT 150000,
    single_limit NUMERIC(19, 4) NOT NULL DEFAULT 50000,
    monthly_limit NUMERIC(19, 4),
    custom_limits JSONB DEFAULT '{}',
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    created_by UUID REFERENCES auth_users(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, currency, effective_from)
);

CREATE INDEX idx_user_limits_user_id ON user_transaction_limits(user_id);
CREATE INDEX idx_user_limits_currency ON user_transaction_limits(currency);
CREATE INDEX idx_user_limits_effective ON user_transaction_limits(effective_from, effective_until);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_security_alerts_updated_at 
    BEFORE UPDATE ON security_alerts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suspicious_activity_reports_updated_at 
    BEFORE UPDATE ON suspicious_activity_reports 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE security_events IS 'Security events and monitoring data';
COMMENT ON TABLE security_alerts IS 'Security alerts requiring attention';
COMMENT ON TABLE blocked_ips IS 'Blocked IP addresses';
COMMENT ON TABLE aml_monitoring IS 'Anti-money laundering monitoring records';
COMMENT ON TABLE suspicious_activity_reports IS 'Suspicious activity reports for regulatory compliance';
COMMENT ON TABLE user_transaction_limits IS 'User-specific transaction limits';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default transaction limits for existing users
INSERT INTO user_transaction_limits (user_id, currency, daily_limit, single_limit, reason, created_at)
SELECT 
    id, 
    'KES', 
    150000, 
    50000, 
    'Default CBK compliance limits', 
    NOW()
FROM auth_users 
WHERE NOT EXISTS (
    SELECT 1 FROM user_transaction_limits 
    WHERE user_transaction_limits.user_id = auth_users.id 
    AND currency = 'KES'
);