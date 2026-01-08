import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function POST(request) {
  try {
    // Check admin access
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // For now, allow any authenticated user to run migration
    // In production, this should be restricted to admin users only
    
    console.log('🔒 Starting security migration...');
    
    // Read the migration file
    const migrationPath = join(__dirname, '../../../../../database/migrations/002_security_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await sql.unsafe(migrationSQL);
    
    console.log('✅ Security migration completed successfully!');
    
    return Response.json({
      ok: true,
      message: 'Security migration completed successfully',
      tables: [
        'security_events',
        'security_alerts', 
        'blocked_ips',
        'aml_monitoring',
        'suspicious_activity_reports',
        'user_transaction_limits'
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