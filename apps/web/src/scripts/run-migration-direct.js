#!/usr/bin/env node

/**
 * Direct Database Migration Runner
 * Runs security migration directly without requiring the dev server
 */

import { Pool } from '@neondatabase/serverless';

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔒 Starting security migration...');
    
    // Create security tables directly with SQL
    const migrationQueries = [
      // Security events table
      `CREATE TABLE IF NOT EXISTS security_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        user_id UUID,
        ip_address INET,
        user_agent TEXT,
        endpoint TEXT,
        threat_level TEXT NOT NULL DEFAULT 'low',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Indexes for security_events
      `CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type)`,
      `CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON security_events(ip_address)`,
      `CREATE INDEX IF NOT EXISTS idx_security_events_threat_level ON security_events(threat_level)`,
      `CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC)`,
      
      // Security alerts table
      `CREATE TABLE IF NOT EXISTS security_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        threat_level TEXT NOT NULL,
        user_id UUID,
        ip_address INET,
        details JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'open',
        assigned_to UUID,
        resolved_at TIMESTAMPTZ,
        resolution_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Indexes for security_alerts
      `CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status)`,
      `CREATE INDEX IF NOT EXISTS idx_security_alerts_threat_level ON security_alerts(threat_level)`,
      `CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC)`,
      
      // Blocked IPs table
      `CREATE TABLE IF NOT EXISTS blocked_ips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ip_address INET NOT NULL UNIQUE,
        reason TEXT NOT NULL,
        blocked_by UUID,
        blocked_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        is_permanent BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}'
      )`,
      
      // Indexes for blocked_ips
      `CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip_address ON blocked_ips(ip_address)`,
      `CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires_at ON blocked_ips(expires_at)`,
      
      // Add security columns to auth_users if they don't exist
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS lock_reason TEXT`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMPTZ`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_ip INET`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`,
      
      // Add indexes for auth_users security columns
      `CREATE INDEX IF NOT EXISTS idx_auth_users_account_locked ON auth_users(account_locked)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_users_last_login_ip ON auth_users(last_login_ip)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_users_two_factor_enabled ON auth_users(two_factor_enabled)`,
      
      // Add security columns to payment_intents if they don't exist
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) DEFAULT 0`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]'`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS aml_status TEXT DEFAULT 'pending'`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS aml_checked_at TIMESTAMPTZ`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS aml_checked_by UUID`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ip_address INET`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS user_agent TEXT`,
      
      // Add indexes for payment_intents security columns
      `CREATE INDEX IF NOT EXISTS idx_payment_intents_risk_score ON payment_intents(risk_score)`,
      `CREATE INDEX IF NOT EXISTS idx_payment_intents_aml_status ON payment_intents(aml_status)`,
      `CREATE INDEX IF NOT EXISTS idx_payment_intents_ip_address ON payment_intents(ip_address)`,
      
      // Add security columns to audit_logs if they don't exist
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS endpoint TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id TEXT`,
      
      // Add indexes for audit_logs security columns
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id)`,
      
      // AML monitoring table
      `CREATE TABLE IF NOT EXISTS aml_monitoring (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        transaction_id UUID,
        monitoring_type TEXT NOT NULL,
        amount NUMERIC(19, 4),
        currency TEXT DEFAULT 'KES',
        risk_score NUMERIC(5,2) DEFAULT 0,
        risk_factors JSONB DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by UUID,
        reviewed_at TIMESTAMPTZ,
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      // Indexes for aml_monitoring
      `CREATE INDEX IF NOT EXISTS idx_aml_monitoring_user_id ON aml_monitoring(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_aml_monitoring_transaction_id ON aml_monitoring(transaction_id)`,
      `CREATE INDEX IF NOT EXISTS idx_aml_monitoring_status ON aml_monitoring(status)`,
      `CREATE INDEX IF NOT EXISTS idx_aml_monitoring_created_at ON aml_monitoring(created_at DESC)`,
      
      // User transaction limits table
      `CREATE TABLE IF NOT EXISTS user_transaction_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        currency TEXT NOT NULL DEFAULT 'KES',
        daily_limit NUMERIC(19, 4) NOT NULL DEFAULT 150000,
        single_limit NUMERIC(19, 4) NOT NULL DEFAULT 50000,
        monthly_limit NUMERIC(19, 4),
        custom_limits JSONB DEFAULT '{}',
        effective_from TIMESTAMPTZ DEFAULT NOW(),
        effective_until TIMESTAMPTZ,
        created_by UUID,
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, currency, effective_from)
      )`,
      
      // Indexes for user_transaction_limits
      `CREATE INDEX IF NOT EXISTS idx_user_limits_user_id ON user_transaction_limits(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_user_limits_currency ON user_transaction_limits(currency)`,
      `CREATE INDEX IF NOT EXISTS idx_user_limits_effective ON user_transaction_limits(effective_from, effective_until)`
    ];
    
    let successCount = 0;
    let errorCount = 0;
    
    // Execute all migration queries
    for (const [index, query] of migrationQueries.entries()) {
      try {
        await pool.query(query);
        successCount++;
        console.log(`✅ Query ${index + 1}/${migrationQueries.length} executed successfully`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Query ${index + 1}/${migrationQueries.length} failed:`, error.message);
        // Continue with other queries
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successful queries: ${successCount}`);
    console.log(`❌ Failed queries: ${errorCount}`);
    console.log(`📋 Total queries: ${migrationQueries.length}`);
    
    if (errorCount === 0) {
      console.log('\n🎉 Security migration completed successfully!');
      console.log('📊 Created/Enhanced tables:');
      console.log('  - security_events (with indexes)');
      console.log('  - security_alerts (with indexes)');
      console.log('  - blocked_ips (with indexes)');
      console.log('  - aml_monitoring (with indexes)');
      console.log('  - user_transaction_limits (with indexes)');
      console.log('🔧 Enhanced existing tables with security columns:');
      console.log('  - auth_users (security columns + indexes)');
      console.log('  - payment_intents (security columns + indexes)');
      console.log('  - audit_logs (security columns + indexes)');
    } else {
      console.log('\n⚠️  Migration completed with some errors. Check the logs above.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export { runMigration };