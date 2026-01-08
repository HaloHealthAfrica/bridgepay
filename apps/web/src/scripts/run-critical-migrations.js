#!/usr/bin/env node

/**
 * Critical Migrations Runner
 * Applies the database migrations for critical blocker fixes
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import sql from '../app/api/utils/sql.js';

const MIGRATIONS_DIR = '../../../database/migrations';

const migrations = [
  '003_wallet_balance_constraints.sql',
  '004_qr_code_security_enhancements.sql'
];

async function runMigration(filename) {
  console.log(`📄 Running migration: ${filename}`);
  
  try {
    const migrationPath = join(process.cwd(), 'apps/database/migrations', filename);
    const migrationSQL = await readFile(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        await sql.unsafe(statement);
      }
    }
    
    console.log(`✅ Migration ${filename} completed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Migration ${filename} failed:`, error.message);
    return false;
  }
}

async function createMigrationLog() {
  try {
    // Create migration log table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS migration_log (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        success BOOLEAN NOT NULL DEFAULT true,
        error_message TEXT
      )
    `;
    console.log('📋 Migration log table ready');
  } catch (error) {
    console.error('❌ Failed to create migration log table:', error.message);
    throw error;
  }
}

async function logMigration(filename, success, errorMessage = null) {
  try {
    await sql`
      INSERT INTO migration_log (filename, success, error_message)
      VALUES (${filename}, ${success}, ${errorMessage})
      ON CONFLICT (filename) 
      DO UPDATE SET 
        applied_at = NOW(),
        success = ${success},
        error_message = ${errorMessage}
    `;
  } catch (error) {
    console.error('⚠️  Failed to log migration:', error.message);
  }
}

async function checkMigrationStatus(filename) {
  try {
    const result = await sql`
      SELECT success FROM migration_log WHERE filename = ${filename}
    `;
    return result[0]?.success || false;
  } catch (error) {
    return false;
  }
}

async function runAllMigrations() {
  console.log('🚀 Starting Critical Blocker Database Migrations');
  console.log('=' .repeat(50));
  
  try {
    await createMigrationLog();
    
    let allSuccessful = true;
    
    for (const migration of migrations) {
      // Check if migration already applied successfully
      const alreadyApplied = await checkMigrationStatus(migration);
      
      if (alreadyApplied) {
        console.log(`⏭️  Migration ${migration} already applied successfully`);
        continue;
      }
      
      const success = await runMigration(migration);
      await logMigration(migration, success, success ? null : 'See console for details');
      
      if (!success) {
        allSuccessful = false;
      }
    }
    
    console.log('\n📋 Migration Summary');
    console.log('=' .repeat(20));
    
    if (allSuccessful) {
      console.log('✅ All critical migrations completed successfully!');
      console.log('\n🔧 Applied fixes:');
      console.log('  • Wallet balance race condition prevention');
      console.log('  • QR code security enhancements');
      console.log('  • Database constraints and indexes');
      console.log('\n🎉 Database is ready for production!');
    } else {
      console.log('❌ Some migrations failed. Please check the errors above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Migration process crashed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    await sql.end();
  }
}

// Run the migrations
runAllMigrations().catch(error => {
  console.error('💥 Migration runner crashed:', error);
  process.exit(1);
});