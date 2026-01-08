#!/usr/bin/env node

/**
 * Security Migration Runner
 * Applies security tables and enhancements to the database
 */

import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runSecurityMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔒 Starting security migration...');
    
    // Read the migration file
    const migrationPath = join(__dirname, '../../../database/migrations/002_security_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Security migration completed successfully!');
    console.log('📊 Created tables:');
    console.log('  - security_events');
    console.log('  - security_alerts');
    console.log('  - blocked_ips');
    console.log('  - aml_monitoring');
    console.log('  - suspicious_activity_reports');
    console.log('  - user_transaction_limits');
    console.log('🔧 Enhanced existing tables with security columns');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSecurityMigration();
}

export { runSecurityMigration };