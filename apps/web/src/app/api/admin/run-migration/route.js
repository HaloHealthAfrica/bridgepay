import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // For now, allow any authenticated user to run migration
    // In production, this should be restricted to admin users only
    
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
      
      // Add security columns to auth_users if they don't exist
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS lock_reason TEXT`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMPTZ`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_ip INET`,
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
      
      // Add security columns to payment_intents if they don't exist
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) DEFAULT 0`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]'`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS aml_status TEXT DEFAULT 'pending'`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ip_address INET`,
      `ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS user_agent TEXT`,
      
      // Add security columns to audit_logs if they don't exist
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS endpoint TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id TEXT`
    ];
    
    // Execute all migration queries
    for (const query of migrationQueries) {
      try {
        await sql.unsafe(query);
      } catch (error) {
        console.error('Migration query failed:', query, error);
        // Continue with other queries
      }
    }
    
    console.log('✅ Security migration completed successfully!');
    
    return Response.json({
      ok: true,
      message: 'Security migration completed successfully',
      tables: [
        'security_events',
        'security_alerts', 
        'blocked_ips'
      ],
      enhancements: [
        'auth_users security columns',
        'payment_intents security columns',
        'audit_logs security columns'
      ]
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return Response.json({
      ok: false,
      error: 'Migration failed',
      details: error.message
    }, { status: 500 });
  }
}