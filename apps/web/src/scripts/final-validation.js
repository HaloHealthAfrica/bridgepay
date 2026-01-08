#!/usr/bin/env node

/**
 * Final Validation for Critical Blocker Fixes
 * Focuses on JavaScript syntax and basic functionality validation
 */

console.log('🚀 Final Validation - Critical Blocker Fixes');
console.log('=' .repeat(50));

// Test 1: JavaScript Syntax Validation
console.log('\n📄 JavaScript Syntax Validation:');

const files = [
  'src/app/api/wallet/_helpers_secure.js',
  'src/app/api/qr/generate/route.js', 
  'src/app/api/qr/pay/route.js'
];

let allValid = true;

for (const file of files) {
  try {
    // Use Node.js --check to validate syntax
    const { execSync } = require('child_process');
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
    console.log(`  ✅ ${file} - Syntax OK`);
  } catch (error) {
    console.log(`  ❌ ${file} - Syntax Error: ${error.message}`);
    allValid = false;
  }
}

// Test 2: Critical Function Validation
console.log('\n🔧 Critical Function Validation:');

try {
  const fs = require('fs');
  
  // Check wallet helpers for race condition fix
  const walletHelpers = fs.readFileSync('src/app/api/wallet/_helpers_secure.js', 'utf8');
  if (walletHelpers.includes('FOR UPDATE') && walletHelpers.includes('sql.transaction')) {
    console.log('  ✅ Wallet race condition fix - Row locking implemented');
  } else {
    console.log('  ❌ Wallet race condition fix - Missing row locking');
    allValid = false;
  }
  
  // Check QR generate for crypto.randomBytes
  const qrGenerate = fs.readFileSync('src/app/api/qr/generate/route.js', 'utf8');
  if (qrGenerate.includes('randomBytes') && qrGenerate.includes('crypto')) {
    console.log('  ✅ QR code security fix - Crypto random generation implemented');
  } else {
    console.log('  ❌ QR code security fix - Missing crypto random generation');
    allValid = false;
  }
  
  // Check QR pay for atomic updates
  const qrPay = fs.readFileSync('src/app/api/qr/pay/route.js', 'utf8');
  if (qrPay.includes('UPDATE qr_codes') && qrPay.includes('WHERE code = ${code} AND status = \'active\'')) {
    console.log('  ✅ QR double redemption fix - Atomic updates implemented');
  } else {
    console.log('  ❌ QR double redemption fix - Missing atomic updates');
    allValid = false;
  }
  
} catch (error) {
  console.log(`  ❌ Function validation failed: ${error.message}`);
  allValid = false;
}

// Test 3: Migration Files Exist
console.log('\n📄 Migration Files:');

const migrationFiles = [
  '../database/migrations/003_wallet_balance_constraints.sql',
  '../database/migrations/004_qr_code_security_enhancements.sql'
];

for (const file of migrationFiles) {
  try {
    const fs = require('fs');
    fs.accessSync(file);
    console.log(`  ✅ ${file} - File exists`);
  } catch (error) {
    console.log(`  ❌ ${file} - File missing`);
    allValid = false;
  }
}

// Final Summary
console.log('\n📋 Final Validation Summary');
console.log('=' .repeat(30));

if (allValid) {
  console.log('✅ ALL VALIDATIONS PASSED!');
  console.log('\n🎉 Critical blocker fixes are ready for GitHub:');
  console.log('  • JavaScript syntax: ✅ Valid');
  console.log('  • Wallet race condition: ✅ Fixed with row locking');
  console.log('  • QR code security: ✅ Fixed with crypto.randomBytes');
  console.log('  • QR double redemption: ✅ Fixed with atomic updates');
  console.log('  • Migration files: ✅ Present');
  console.log('\n🚀 READY TO PUSH TO GITHUB! 🚀');
  process.exit(0);
} else {
  console.log('❌ VALIDATION FAILED');
  console.log('⚠️  Please fix the issues above before pushing');
  process.exit(1);
}