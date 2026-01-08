import { cleanupExpiredIdempotencyKeys } from "../middleware/idempotency";
import { prisma } from "../lib/prisma";

/**
 * Cleanup job for expired idempotency keys
 *
 * This job should run daily to remove idempotency keys older than 24 hours.
 * Add to crontab: 0 2 * * * cd /path/to/backend && node dist/jobs/cleanupIdempotency.js
 */

async function main() {
  console.log("[IdempotencyCleanup] Starting cleanup job...");
  console.log(`[IdempotencyCleanup] Time: ${new Date().toISOString()}`);

  try {
    const deletedCount = await cleanupExpiredIdempotencyKeys();

    console.log(
      `[IdempotencyCleanup] Successfully cleaned up ${deletedCount} expired keys`
    );

    // Optional: Clean up old audit logs older than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Uncomment if you have audit logs to clean
    // const auditResult = await prisma.auditLog.deleteMany({
    //   where: {
    //     createdAt: {
    //       lt: ninetyDaysAgo,
    //     },
    //   },
    // });
    // console.log(`[IdempotencyCleanup] Cleaned up ${auditResult.count} old audit logs`);

    process.exit(0);
  } catch (error) {
    console.error("[IdempotencyCleanup] Error during cleanup:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export default main;
