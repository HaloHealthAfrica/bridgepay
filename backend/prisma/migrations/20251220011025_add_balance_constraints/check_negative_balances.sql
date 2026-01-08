-- Pre-Migration Check: Verify No Negative Balances
-- Run this BEFORE applying the migration to ensure no data conflicts
-- If this query returns any rows, fix those wallets before proceeding

SELECT
  id,
  "userId",
  balance,
  "escrowBalance",
  "createdAt",
  "updatedAt"
FROM "Wallet"
WHERE balance < 0 OR "escrowBalance" < 0
ORDER BY balance ASC, "escrowBalance" ASC;

-- If results found, you can fix them with:
-- UPDATE "Wallet" SET balance = 0 WHERE balance < 0;
-- UPDATE "Wallet" SET "escrowBalance" = 0 WHERE "escrowBalance" < 0;
-- But investigate WHY negative balances exist first!
