#!/usr/bin/env node

/**
 * Simple Migration Script
 */

console.log('🔒 Starting security migration...');

const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";

console.log('Database URL:', DATABASE_URL ? 'Set' : 'Not set');

try {
  const { Pool } = await import('@neondatabase/serverless');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  console.log('✅ Database connection created');

  // Test connection
  const result = await pool.query('SELECT NOW()');
  console.log('✅ Database connection successful:', result.rows[0]);

  // Create security_events table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type TEXT NOT NULL,
      user_id UUID,
      ip_address INET,
      user_agent TEXT,
      endpoint TEXT,
      threat_level TEXT NOT NULL DEFAULT 'low',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✅ security_events table created');

  // Create security_alerts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type TEXT NOT NULL,
      threat_level TEXT NOT NULL,
      user_id UUID,
      ip_address INET,
      details JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✅ security_alerts table created');

  // Create blocked_ips table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ip_address INET NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      blocked_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      is_permanent BOOLEAN DEFAULT FALSE
    )
  `);
  console.log('✅ blocked_ips table created');

  // Add security columns to auth_users
  try {
    await pool.query('ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_ip INET');
    console.log('✅ auth_users security columns added');
  } catch (error) {
    console.log('⚠️  auth_users columns may already exist:', error.message);
  }

  // Add security columns to payment_intents
  try {
    await pool.query('ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) DEFAULT 0');
    await pool.query('ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ip_address INET');
    await pool.query('ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS user_agent TEXT');
    console.log('✅ payment_intents security columns added');
  } catch (error) {
    console.log('⚠️  payment_intents columns may already exist:', error.message);
  }

  // Add security columns to audit_logs
  try {
    await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET');
    await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT');
    await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS endpoint TEXT');
    console.log('✅ audit_logs security columns added');
  } catch (error) {
    console.log('⚠️  audit_logs columns may already exist:', error.message);
  }

  await pool.end();
  console.log('🎉 Security migration completed successfully!');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}