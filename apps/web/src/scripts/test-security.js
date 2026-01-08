#!/usr/bin/env node

/**
 * Security Implementation Test Script
 * Tests the security fixes and validates they're working correctly
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  testUser: {
    email: 'test@example.com',
    password: 'TestPassword123!'
  }
};

// Security tests to run
const SECURITY_TESTS = [
  {
    name: 'Rate Limiting Test',
    description: 'Test that rate limiting is working',
    test: testRateLimiting
  },
  {
    name: 'Authentication Test',
    description: 'Test authentication requirements',
    test: testAuthentication
  },
  {
    name: 'Input Validation Test',
    description: 'Test input validation and sanitization',
    test: testInputValidation
  },
  {
    name: 'Security Headers Test',
    description: 'Test security headers are present',
    test: testSecurityHeaders
  },
  {
    name: 'SQL Injection Prevention Test',
    description: 'Test SQL injection prevention',
    test: testSQLInjectionPrevention
  }
];

async function makeRequest(endpoint, options = {}) {
  const url = `${TEST_CONFIG.baseUrl}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SecurityTestScript/1.0',
        ...options.headers
      },
      ...options
    });
    
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text()
    };
  } catch (error) {
    return {
      error: error.message,
      status: 0
    };
  }
}

async function testRateLimiting() {
  console.log('  Testing rate limiting...');
  
  const results = [];
  const endpoint = '/api/wallet/sources';
  
  // Make multiple rapid requests
  for (let i = 0; i < 15; i++) {
    const response = await makeRequest(endpoint, {
      method: 'GET'
    });
    results.push(response);
  }
  
  // Check if any requests were rate limited (429 status)
  const rateLimited = results.some(r => r.status === 429);
  
  return {
    passed: rateLimited,
    message: rateLimited 
      ? 'Rate limiting is working - requests were blocked'
      : 'Rate limiting may not be working - no 429 responses',
    details: {
      totalRequests: results.length,
      rateLimitedRequests: results.filter(r => r.status === 429).length,
      statusCodes: results.map(r => r.status)
    }
  };
}

async function testAuthentication() {
  console.log('  Testing authentication requirements...');
  
  const protectedEndpoints = [
    '/api/wallet/balance',
    '/api/wallet/sources',
    '/api/payments/intent'
  ];
  
  const results = [];
  
  for (const endpoint of protectedEndpoints) {
    const response = await makeRequest(endpoint, {
      method: 'GET'
    });
    
    results.push({
      endpoint,
      status: response.status,
      requiresAuth: response.status === 401
    });
  }
  
  const allRequireAuth = results.every(r => r.requiresAuth);
  
  return {
    passed: allRequireAuth,
    message: allRequireAuth
      ? 'All protected endpoints require authentication'
      : 'Some endpoints may not require authentication',
    details: results
  };
}

async function testInputValidation() {
  console.log('  Testing input validation...');
  
  const maliciousInputs = [
    "'; DROP TABLE users; --",
    "<script>alert('xss')</script>",
    "../../etc/passwd",
    "' OR '1'='1",
    "javascript:alert('xss')"
  ];
  
  const results = [];
  
  for (const input of maliciousInputs) {
    const response = await makeRequest('/api/payments/intent', {
      method: 'POST',
      body: JSON.stringify({
        amount: input,
        currency: input,
        merchantId: input
      })
    });
    
    results.push({
      input: input.slice(0, 20) + '...',
      status: response.status,
      blocked: response.status === 400 || response.status === 401
    });
  }
  
  const allBlocked = results.every(r => r.blocked);
  
  return {
    passed: allBlocked,
    message: allBlocked
      ? 'Malicious inputs are being blocked'
      : 'Some malicious inputs may not be blocked',
    details: results
  };
}

async function testSecurityHeaders() {
  console.log('  Testing security headers...');
  
  const response = await makeRequest('/api/wallet/sources', {
    method: 'GET'
  });
  
  const requiredHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'x-xss-protection'
  ];
  
  const presentHeaders = requiredHeaders.filter(header => 
    response.headers[header] || response.headers[header.toLowerCase()]
  );
  
  return {
    passed: presentHeaders.length >= 2, // At least 2 security headers
    message: `${presentHeaders.length}/${requiredHeaders.length} security headers present`,
    details: {
      requiredHeaders,
      presentHeaders,
      allHeaders: Object.keys(response.headers)
    }
  };
}

async function testSQLInjectionPrevention() {
  console.log('  Testing SQL injection prevention...');
  
  const sqlInjectionAttempts = [
    "1' OR '1'='1",
    "'; DROP TABLE wallet_ledger; --",
    "1 UNION SELECT * FROM auth_users",
    "1'; INSERT INTO audit_logs VALUES ('hack'); --"
  ];
  
  const results = [];
  
  for (const attempt of sqlInjectionAttempts) {
    const response = await makeRequest('/api/wallet/balance', {
      method: 'GET',
      headers: {
        'X-User-ID': attempt // Try to inject via header
      }
    });
    
    results.push({
      attempt: attempt.slice(0, 30) + '...',
      status: response.status,
      blocked: response.status !== 200 || !response.body.includes('balance')
    });
  }
  
  const allBlocked = results.every(r => r.blocked);
  
  return {
    passed: allBlocked,
    message: allBlocked
      ? 'SQL injection attempts are being blocked'
      : 'Some SQL injection attempts may not be blocked',
    details: results
  };
}

async function runSecurityTests() {
  console.log('🔒 Starting Security Implementation Tests\n');
  console.log(`Testing against: ${TEST_CONFIG.baseUrl}\n`);
  
  const testResults = [];
  
  for (const test of SECURITY_TESTS) {
    console.log(`🧪 ${test.name}`);
    console.log(`   ${test.description}`);
    
    try {
      const result = await test.test();
      testResults.push({
        name: test.name,
        ...result
      });
      
      const icon = result.passed ? '✅' : '❌';
      console.log(`   ${icon} ${result.message}\n`);
      
    } catch (error) {
      testResults.push({
        name: test.name,
        passed: false,
        message: `Test failed: ${error.message}`,
        error: error.message
      });
      
      console.log(`   ❌ Test failed: ${error.message}\n`);
    }
  }
  
  // Summary
  const passedTests = testResults.filter(r => r.passed).length;
  const totalTests = testResults.length;
  
  console.log('📊 Test Summary');
  console.log('================');
  console.log(`Passed: ${passedTests}/${totalTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%\n`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All security tests passed!');
  } else {
    console.log('⚠️  Some security tests failed. Review the results above.');
  }
  
  // Detailed results
  console.log('\n📋 Detailed Results:');
  testResults.forEach(result => {
    console.log(`\n${result.name}: ${result.passed ? 'PASS' : 'FAIL'}`);
    console.log(`  ${result.message}`);
    if (result.details) {
      console.log(`  Details:`, JSON.stringify(result.details, null, 2));
    }
  });
  
  return {
    totalTests,
    passedTests,
    successRate: Math.round((passedTests / totalTests) * 100),
    results: testResults
  };
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSecurityTests().catch(console.error);
}

export { runSecurityTests };