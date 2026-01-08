/**
 * Environment Variable Validation
 * Validates required environment variables on startup
 * 
 * Usage: node scripts/validate-env.js
 * Or import and call validateEnv() in your application
 */

const requiredVars = [
  'DATABASE_URL',
  'AUTH_SECRET',
];

const optionalVars = [
  'APP_URL',
  'NODE_ENV',
  'NEXT_PUBLIC_CREATE_API_BASE_URL',
  'CREATE_TEMP_API_KEY',
  'NEXT_PUBLIC_PROJECT_GROUP_ID',
  'LEMONADE_BASE_URL',
  'LEMONADE_CONSUMER_KEY',
  'LEMONADE_CONSUMER_SECRET',
  'LEMONADE_CLIENT_ID',
  'LEMONADE_CLIENT_SECRET',
  'LEMONADE_RELAY_URL',
  'LEMONADE_RELAY_KEY',
  'CORS_ORIGINS',
  'REDIS_URL',
];

const warnings = [];

function validateEnv() {
  const missing = [];
  const errors = [];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Validate AUTH_SECRET length
  if (process.env.AUTH_SECRET) {
    if (process.env.AUTH_SECRET.length < 32) {
      errors.push('AUTH_SECRET must be at least 32 characters long');
    }
  }

  // Validate DATABASE_URL format
  if (process.env.DATABASE_URL) {
    if (!process.env.DATABASE_URL.startsWith('postgresql://') && 
        !process.env.DATABASE_URL.startsWith('postgres://')) {
      warnings.push('DATABASE_URL should start with postgresql:// or postgres://');
    }
  }

  // Validate APP_URL format
  if (process.env.APP_URL) {
    try {
      new URL(process.env.APP_URL);
    } catch {
      warnings.push('APP_URL should be a valid URL');
    }
  }

  // Check for conflicting Lemonade auth methods
  const hasConsumerKey = !!(process.env.LEMONADE_CONSUMER_KEY && process.env.LEMONADE_CONSUMER_SECRET);
  const hasClientCredentials = !!(process.env.LEMONADE_CLIENT_ID && process.env.LEMONADE_CLIENT_SECRET);
  
  if (!hasConsumerKey && !hasClientCredentials) {
    warnings.push('Either LEMONADE_CONSUMER_KEY/SECRET or LEMONADE_CLIENT_ID/SECRET should be set');
  }

  // Report results
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\n💡 Copy apps/web/env.example to apps/web/.env and fill in the values (or set them in Vercel).');
    process.exit(1);
  }

  if (errors.length > 0) {
    console.error('❌ Environment variable errors:');
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Environment variable warnings:');
    warnings.forEach(w => console.warn(`   - ${w}`));
  }

  console.log('✅ Environment variables validated');
  return true;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || require.main === module) {
  validateEnv();
}

export default validateEnv;



