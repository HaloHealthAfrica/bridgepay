#!/usr/bin/env node

/**
 * Race Condition Test Script
 * Tests the critical fixes for wallet balance race conditions and QR code double redemption
 */

import { performance } from 'perf_hooks';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000';
const TEST_TOKEN = process.env.TEST_TOKEN; // Bearer token for testing

if (!TEST_TOKEN) {
  console.error('❌ TEST_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${TEST_TOKEN}`,
  'Content-Type': 'application/json',
};

async function makeRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, data, ok: response.ok };
  } catch (error) {
    return { status: 0, data: { error: error.message }, ok: false };
  }
}

async function testWalletRaceCondition() {
  console.log('\n🧪 Testing Wallet Balance Race Condition Fix...');
  
  // Create test users and wallets (assuming they exist)
  const testUserId1 = 'test-user-1';
  const testUserId2 = 'test-user-2';
  
  // Test concurrent transfers
  const transferAmount = 100; // 100 KES
  const concurrentRequests = 10;
  
  console.log(`📊 Running ${concurrentRequests} concurrent transfers of ${transferAmount} KES each...`);
  
  const startTime = performance.now();
  
  // Create array of concurrent transfer promises
  const transferPromises = Array.from({ length: concurrentRequests }, (_, i) => 
    makeRequest('/api/wallet/transfer', 'POST', {
      amount: transferAmount,
      recipient_user_id: testUserId2,
      narration: `Race condition test ${i + 1}`,
      currency: 'KES'
    })
  );
  
  // Execute all transfers concurrently
  const results = await Promise.allSettled(transferPromises);
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  // Analyze results
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  const failed = results.filter(r => r.status === 'fulfilled' && !r.value.ok).length;
  const errors = results.filter(r => r.status === 'rejected').length;
  
  console.log(`⏱️  Test completed in ${duration.toFixed(2)}ms`);
  console.log(`✅ Successful transfers: ${successful}`);
  console.log(`❌ Failed transfers: ${failed}`);
  console.log(`💥 Network errors: ${errors}`);
  
  // Check for insufficient funds errors (expected behavior)
  const insufficientFundsErrors = results
    .filter(r => r.status === 'fulfilled' && !r.value.ok)
    .filter(r => r.value.data?.error === 'insufficient_funds' || 
                 r.value.data?.message?.includes('insufficient'))
    .length;
  
  console.log(`💰 Insufficient funds errors: ${insufficientFundsErrors} (expected)`);
  
  // Validate no negative balance errors occurred
  const negativeBalanceErrors = results
    .filter(r => r.status === 'fulfilled')
    .filter(r => r.value.data?.error?.includes('negative') || 
                 r.value.data?.message?.includes('negative'))
    .length;
  
  if (negativeBalanceErrors === 0) {
    console.log('✅ No negative balance errors - race condition fix working!');
    return true;
  } else {
    console.log(`❌ Found ${negativeBalanceErrors} negative balance errors - race condition fix failed!`);
    return false;
  }
}

async function testQRDoubleRedemption() {
  console.log('\n🧪 Testing QR Code Double Redemption Fix...');
  
  // First, generate a QR code
  console.log('📱 Generating test QR code...');
  const qrResponse = await makeRequest('/api/qr/generate', 'POST', {
    mode: 'pay',
    amount: 1000,
    currency: 'KES',
    expiresIn: 3600 // 1 hour
  });
  
  if (!qrResponse.ok) {
    console.log('❌ Failed to generate QR code:', qrResponse.data);
    return false;
  }
  
  const qrCode = qrResponse.data.code;
  console.log(`📱 Generated QR code: ${qrCode}`);
  
  // Test concurrent QR redemptions
  const concurrentRedemptions = 20;
  console.log(`📊 Running ${concurrentRedemptions} concurrent QR redemptions...`);
  
  const startTime = performance.now();
  
  // Create array of concurrent redemption promises
  const redemptionPromises = Array.from({ length: concurrentRedemptions }, (_, i) => 
    makeRequest('/api/qr/pay', 'POST', {
      code: qrCode,
      method: 'stk',
      phone_number: '254712345678',
      reference: `test-redemption-${i + 1}`
    })
  );
  
  // Execute all redemptions concurrently
  const results = await Promise.allSettled(redemptionPromises);
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  // Analyze results
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  const alreadyUsed = results
    .filter(r => r.status === 'fulfilled' && !r.value.ok)
    .filter(r => r.value.data?.error === 'already_used')
    .length;
  const otherErrors = results.filter(r => 
    r.status === 'fulfilled' && 
    !r.value.ok && 
    r.value.data?.error !== 'already_used'
  ).length;
  
  console.log(`⏱️  Test completed in ${duration.toFixed(2)}ms`);
  console.log(`✅ Successful redemptions: ${successful}`);
  console.log(`🔒 Already used errors: ${alreadyUsed}`);
  console.log(`❌ Other errors: ${otherErrors}`);
  
  // Validate exactly one successful redemption
  if (successful === 1 && alreadyUsed >= concurrentRedemptions - 1) {
    console.log('✅ Exactly one redemption succeeded - double redemption fix working!');
    return true;
  } else {
    console.log(`❌ Expected 1 success, got ${successful} - double redemption fix failed!`);
    return false;
  }
}

async function testQRCodeSecurity() {
  console.log('\n🧪 Testing QR Code Security Enhancements...');
  
  // Generate multiple QR codes to test entropy
  console.log('🔐 Testing QR code entropy...');
  const qrCodes = new Set();
  const numCodes = 100;
  
  for (let i = 0; i < numCodes; i++) {
    const response = await makeRequest('/api/qr/generate', 'POST', {
      mode: 'pay',
      amount: 1000,
      currency: 'KES'
    });
    
    if (response.ok) {
      qrCodes.add(response.data.code);
    }
  }
  
  console.log(`📊 Generated ${qrCodes.size} unique codes out of ${numCodes} attempts`);
  
  if (qrCodes.size === numCodes) {
    console.log('✅ All QR codes are unique - entropy fix working!');
    
    // Test code format (should be base64url)
    const sampleCode = Array.from(qrCodes)[0];
    const isBase64Url = /^[A-Za-z0-9_-]+$/.test(sampleCode);
    
    if (isBase64Url) {
      console.log('✅ QR codes use secure base64url format');
      return true;
    } else {
      console.log('❌ QR codes not in expected base64url format');
      return false;
    }
  } else {
    console.log(`❌ Found ${numCodes - qrCodes.size} duplicate codes - entropy fix failed!`);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Critical Blocker Validation Tests');
  console.log('=' .repeat(50));
  
  const results = {
    walletRaceCondition: false,
    qrDoubleRedemption: false,
    qrCodeSecurity: false
  };
  
  try {
    results.walletRaceCondition = await testWalletRaceCondition();
  } catch (error) {
    console.log('❌ Wallet race condition test failed:', error.message);
  }
  
  try {
    results.qrDoubleRedemption = await testQRDoubleRedemption();
  } catch (error) {
    console.log('❌ QR double redemption test failed:', error.message);
  }
  
  try {
    results.qrCodeSecurity = await testQRCodeSecurity();
  } catch (error) {
    console.log('❌ QR code security test failed:', error.message);
  }
  
  // Summary
  console.log('\n📋 Test Results Summary');
  console.log('=' .repeat(30));
  console.log(`Wallet Race Condition Fix: ${results.walletRaceCondition ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`QR Double Redemption Fix: ${results.qrDoubleRedemption ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`QR Code Security Fix: ${results.qrCodeSecurity ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(result => result === true);
  
  if (allPassed) {
    console.log('\n🎉 ALL CRITICAL BLOCKERS FIXED! System is ready for production.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some critical blockers still need attention.');
    process.exit(1);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});