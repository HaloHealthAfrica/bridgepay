import { prisma } from "../lib/prisma";
import crypto from "crypto";

/**
 * Deployment Verification Script
 *
 * Run this after deploying to verify all critical fixes are in place:
 * - Database constraints
 * - Idempotency table
 * - Transaction references using UUID
 * - Environment variables
 *
 * Usage: npm run verify-deployment
 * Or: ts-node src/scripts/verifyDeployment.ts
 */

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "LEMONADE_CONSUMER_KEY",
  "LEMONADE_CONSUMER_SECRET",
  "LEMONADE_ALLOWED_IPS",
  "LEMONADE_WEBHOOK_SECRET",
];

const OPTIONAL_ENV_VARS = [
  "WAPIPAY_BASE_URL",
  "WAPIPAY_BEARER_TOKEN",
  "MPESA_SKIP_IP_CHECK",
];

async function verifyDeployment() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║   BridgeV4 Deployment Verification              ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  let hasErrors = false;
  let hasWarnings = false;

  // ==========================================
  // 1. Verify Database Connection
  // ==========================================
  console.log("1️⃣  Checking database connection...");
  try {
    await prisma.$connect();
    console.log("   ✅ Database connection successful\n");
  } catch (error: any) {
    console.error("   ❌ Database connection failed:", error.message);
    hasErrors = true;
    console.log("");
  }

  // ==========================================
  // 2. Verify Database Constraints
  // ==========================================
  console.log("2️⃣  Checking database constraints...");
  try {
    // Try to create a wallet with negative balance (should fail)
    const testUserId = `test-constraint-${Date.now()}`;

    try {
      await prisma.wallet.create({
        data: {
          userId: testUserId,
          balance: -100, // Should fail due to CHECK constraint
          currency: "KES",
        },
      });

      // If we get here, constraint is NOT working
      console.error("   ❌ Balance constraint NOT working!");
      console.error("      Database allowed negative balance");
      hasErrors = true;

      // Clean up test wallet
      await prisma.wallet.delete({ where: { userId: testUserId } });
    } catch (error: any) {
      if (
        error.message.includes("check_balance_non_negative") ||
        error.message.includes("check constraint")
      ) {
        console.log("   ✅ Balance constraint working correctly");
        console.log("      Database rejects negative balances\n");
      } else {
        console.error("   ⚠️  Unexpected error:", error.message);
        hasWarnings = true;
        console.log("");
      }
    }
  } catch (error: any) {
    console.error("   ❌ Constraint check failed:", error.message);
    hasErrors = true;
    console.log("");
  }

  // ==========================================
  // 3. Verify Idempotency Table
  // ==========================================
  console.log("3️⃣  Checking idempotency table...");
  try {
    const count = await prisma.idempotencyKey.count();
    console.log(`   ✅ IdempotencyKey table accessible (${count} records)`);

    // Verify unique constraint
    const testUser = "test-user";
    const testEndpoint = "/test";
    const testHash = "test-hash";

    try {
      await prisma.idempotencyKey.create({
        data: {
          id: crypto.randomUUID(),
          userId: testUser,
          endpoint: testEndpoint,
          requestHash: testHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Try to create duplicate (should fail)
      try {
        await prisma.idempotencyKey.create({
          data: {
            id: crypto.randomUUID(),
            userId: testUser,
            endpoint: testEndpoint,
            requestHash: testHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        console.error("   ❌ Unique constraint NOT working!");
        hasErrors = true;
      } catch {
        console.log("   ✅ Unique constraint working correctly\n");
      }

      // Clean up
      await prisma.idempotencyKey.deleteMany({
        where: {
          userId: testUser,
          endpoint: testEndpoint,
        },
      });
    } catch (error: any) {
      console.error("   ❌ Idempotency test failed:", error.message);
      hasErrors = true;
      console.log("");
    }
  } catch (error: any) {
    console.error("   ❌ IdempotencyKey table not accessible:", error.message);
    console.error("      Run: npx prisma migrate deploy");
    hasErrors = true;
    console.log("");
  }

  // ==========================================
  // 4. Verify Transaction References
  // ==========================================
  console.log("4️⃣  Checking transaction reference format...");
  try {
    const recentTx = await prisma.transaction.findFirst({
      orderBy: { createdAt: "desc" },
      select: { reference: true, createdAt: true },
    });

    if (recentTx) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (uuidRegex.test(recentTx.reference)) {
        console.log("   ✅ Transaction references using UUID");
        console.log(`      Latest: ${recentTx.reference}\n`);
      } else {
        console.error("   ⚠️  Latest transaction using old format");
        console.error(`      Reference: ${recentTx.reference}`);
        console.error("      This is OK if deployed recently");
        console.error("      New transactions will use UUID format\n");
        hasWarnings = true;
      }
    } else {
      console.log("   ℹ️  No transactions found (fresh database)\n");
    }
  } catch (error: any) {
    console.error("   ❌ Transaction check failed:", error.message);
    hasErrors = true;
    console.log("");
  }

  // ==========================================
  // 5. Verify Environment Variables
  // ==========================================
  console.log("5️⃣  Checking environment variables...");

  REQUIRED_ENV_VARS.forEach((varName) => {
    if (process.env[varName]) {
      console.log(`   ✅ ${varName} configured`);
    } else {
      console.error(`   ❌ ${varName} NOT configured`);
      hasErrors = true;
    }
  });

  console.log("");
  console.log("   Optional variables:");
  OPTIONAL_ENV_VARS.forEach((varName) => {
    if (process.env[varName]) {
      console.log(`   ✅ ${varName} configured`);
    } else {
      console.log(`   ℹ️  ${varName} not configured (optional)`);
    }
  });

  console.log("");

  // ==========================================
  // 6. Verify Lemonade IP Configuration
  // ==========================================
  console.log("6️⃣  Checking webhook security...");

  const lemonadeIps = process.env.LEMONADE_ALLOWED_IPS;
  if (lemonadeIps) {
    const ips = lemonadeIps.split(",").map((ip) => ip.trim());
    console.log(`   ✅ Lemonade IPs configured: ${ips.length} entries`);

    if (ips.includes("0.0.0.0/0") || ips.includes("0.0.0.0")) {
      console.error("   ⚠️  WARNING: Allowing all IPs (0.0.0.0/0)");
      console.error("      This is insecure for production!");
      hasWarnings = true;
    }
  } else {
    console.error("   ❌ LEMONADE_ALLOWED_IPS not configured");
    hasErrors = true;
  }

  const mpesaSkipIp = process.env.MPESA_SKIP_IP_CHECK;
  if (mpesaSkipIp === "true") {
    console.error("   ⚠️  WARNING: M-Pesa IP check is disabled");
    console.error("      This should only be true in development!");
    hasWarnings = true;
  } else {
    console.log("   ✅ M-Pesa IP check enabled");
  }

  console.log("");

  // ==========================================
  // Summary
  // ==========================================
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Verification Summary                           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  if (hasErrors) {
    console.error("❌ DEPLOYMENT VERIFICATION FAILED");
    console.error("   Fix the errors above before deploying to production\n");
    process.exit(1);
  } else if (hasWarnings) {
    console.warn("⚠️  DEPLOYMENT VERIFICATION COMPLETED WITH WARNINGS");
    console.warn("   Review the warnings above\n");
    process.exit(0);
  } else {
    console.log("✅ DEPLOYMENT VERIFICATION PASSED");
    console.log("   All critical checks passed successfully!\n");
    process.exit(0);
  }
}

// Run verification
verifyDeployment()
  .catch((error) => {
    console.error("\n❌ Verification script crashed:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
