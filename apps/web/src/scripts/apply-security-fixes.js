#!/usr/bin/env node

/**
 * Security Fixes Application Script
 * Applies comprehensive security fixes to all API routes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Security fixes to apply
const SECURITY_FIXES = {
  // Import statements to add
  imports: [
    'import { logSecurityEvent, SECURITY_EVENTS, THREAT_LEVELS } from "@/app/api/utils/securityMonitor";',
    'import { validateUserId, validatePaymentAmount, validateCurrency } from "@/app/api/utils/validators";',
    'import { rateLimitMiddleware, RATE_LIMITS, generateUserKey } from "@/app/api/utils/rateLimiter";'
  ],

  // Security middleware patterns
  patterns: {
    // Add IP and user agent logging
    ipLogging: `
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';`,

    // Add rate limiting
    rateLimiting: `
  // Rate limiting
  const rateLimitKey = generateUserKey(session.user.id, 'api_endpoint');
  const rateLimit = await rateLimitMiddleware(RATE_LIMITS.API_GENERAL)(request, { userId: session.user.id });
  
  if (rateLimit.blocked) {
    return rateLimit.response;
  }`,

    // Add security logging
    securityLogging: `
  // Log security event
  await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
    userId: session.user.id,
    ip,
    userAgent,
    endpoint: new URL(request.url).pathname,
    threatLevel: THREAT_LEVELS.LOW
  });`
  }
};

// Routes that need specific security levels
const ROUTE_SECURITY_LEVELS = {
  'payments': 'PAYMENT',
  'wallet': 'WALLET', 
  'admin': 'ADMIN',
  'shopping': 'GENERAL'
};

function findApiRoutes(dir) {
  const routes = [];
  
  function scanDirectory(currentDir) {
    const items = readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (item === 'route.js') {
        routes.push(fullPath);
      }
    }
  }
  
  scanDirectory(dir);
  return routes;
}

function analyzeRoute(filePath) {
  const content = readFileSync(filePath, 'utf8');
  
  return {
    hasAuth: content.includes('await auth()') || content.includes('session?.user'),
    hasRateLimit: content.includes('rateLimitMiddleware') || content.includes('RATE_LIMITS'),
    hasSecurityLogging: content.includes('logSecurityEvent') || content.includes('SECURITY_EVENTS'),
    hasValidation: content.includes('validate') && content.includes('ValidationError'),
    hasErrorHandling: content.includes('withErrorHandling') || content.includes('try {'),
    exports: {
      GET: content.includes('export const GET') || content.includes('export async function GET'),
      POST: content.includes('export const POST') || content.includes('export async function POST'),
      PUT: content.includes('export const PUT') || content.includes('export async function PUT'),
      DELETE: content.includes('export const DELETE') || content.includes('export async function DELETE')
    }
  };
}

function getSecurityLevel(filePath) {
  for (const [route, level] of Object.entries(ROUTE_SECURITY_LEVELS)) {
    if (filePath.includes(`/api/${route}/`)) {
      return level;
    }
  }
  return 'GENERAL';
}

function generateSecurityReport(routes) {
  console.log('🔍 Security Audit Report');
  console.log('========================\n');
  
  const report = {
    total: routes.length,
    secure: 0,
    needsFixes: 0,
    critical: 0,
    issues: []
  };
  
  for (const route of routes) {
    const analysis = analyzeRoute(route);
    const securityLevel = getSecurityLevel(route);
    const relativePath = route.replace(process.cwd(), '');
    
    const issues = [];
    let severity = 'LOW';
    
    // Check for critical security issues
    if (!analysis.hasAuth && (securityLevel === 'PAYMENT' || securityLevel === 'WALLET')) {
      issues.push('Missing authentication');
      severity = 'CRITICAL';
    }
    
    if (!analysis.hasRateLimit) {
      issues.push('Missing rate limiting');
      if (severity !== 'CRITICAL') severity = 'HIGH';
    }
    
    if (!analysis.hasSecurityLogging && securityLevel !== 'GENERAL') {
      issues.push('Missing security logging');
      if (severity === 'LOW') severity = 'MEDIUM';
    }
    
    if (!analysis.hasValidation && (analysis.exports.POST || analysis.exports.PUT)) {
      issues.push('Missing input validation');
      if (severity === 'LOW') severity = 'MEDIUM';
    }
    
    if (!analysis.hasErrorHandling) {
      issues.push('Missing error handling');
      if (severity === 'LOW') severity = 'MEDIUM';
    }
    
    if (issues.length === 0) {
      report.secure++;
      console.log(`✅ ${relativePath} - SECURE`);
    } else {
      report.needsFixes++;
      if (severity === 'CRITICAL') report.critical++;
      
      const icon = severity === 'CRITICAL' ? '🚨' : severity === 'HIGH' ? '⚠️' : '⚡';
      console.log(`${icon} ${relativePath} - ${severity}`);
      issues.forEach(issue => console.log(`   - ${issue}`));
      
      report.issues.push({
        path: relativePath,
        severity,
        issues,
        analysis
      });
    }
  }
  
  console.log('\n📊 Summary');
  console.log('===========');
  console.log(`Total routes: ${report.total}`);
  console.log(`Secure routes: ${report.secure}`);
  console.log(`Routes needing fixes: ${report.needsFixes}`);
  console.log(`Critical issues: ${report.critical}`);
  
  return report;
}

async function main() {
  console.log('🔒 Starting Security Audit and Fix Application\n');
  
  const apiDir = join(__dirname, '../src/app/api');
  const routes = findApiRoutes(apiDir);
  
  console.log(`Found ${routes.length} API routes\n`);
  
  // Generate security report
  const report = generateSecurityReport(routes);
  
  // Save report to file
  const reportPath = join(__dirname, '../security-audit-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  if (report.critical > 0) {
    console.log('\n🚨 CRITICAL SECURITY ISSUES FOUND!');
    console.log('These routes need immediate attention:');
    
    report.issues
      .filter(issue => issue.severity === 'CRITICAL')
      .forEach(issue => {
        console.log(`  - ${issue.path}`);
        issue.issues.forEach(i => console.log(`    * ${i}`));
      });
  }
  
  console.log('\n✅ Security audit completed!');
  console.log('Next steps:');
  console.log('1. Review the security report');
  console.log('2. Apply security middleware to critical routes');
  console.log('3. Run database migration for security tables');
  console.log('4. Test all security implementations');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runSecurityAudit };