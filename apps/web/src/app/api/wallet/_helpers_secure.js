import sql from "@/app/api/utils/sql";

export async function getOrCreateWallet(userId, currency = "KES") {
  // Input validation
  if (!userId) throw new Error("userId is required");
  if (!currency || typeof currency !== 'string') throw new Error("Invalid currency");
  
  const ccy = currency.toUpperCase();
  
  // Validate currency against supported currencies
  const supportedCurrencies = ['KES', 'USD', 'EUR'];
  if (!supportedCurrencies.includes(ccy)) {
    throw new Error(`Unsupported currency: ${ccy}`);
  }
  
  const rows = await sql(
    "SELECT id, user_id, currency, balance FROM wallets WHERE user_id = $1 AND currency = $2 LIMIT 1",
    [userId, ccy],
  );
  if (rows && rows[0]) return rows[0];
  
  const inserted = await sql(
    "INSERT INTO wallets (user_id, currency, balance) VALUES ($1, $2, 0) RETURNING id, user_id, currency, balance",
    [userId, ccy],
  );
  return inserted[0];
}

export function nowRef(prefix = "ref") {
  // Use crypto.randomUUID for better security
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  return `${prefix}-${timestamp}-${uuid.slice(0, 8)}`;
}

export async function postLedgerAndUpdateBalance({
  walletId,
  entryType, // 'debit' | 'credit'
  amount,
  currency = "KES",
  ref,
  externalRef = null,
  narration = null,
  counterpartyWalletId = null,
  metadata = {},
}) {
  // Input validation
  if (!walletId) throw new Error("walletId is required");
  if (!['debit', 'credit'].includes(entryType)) throw new Error("Invalid entry type");
  if (!ref) throw new Error("ref is required");
  
  // Atomically insert ledger and update wallet balance
  const amt = Number(amount || 0);
  if (!(amt > 0)) throw new Error("amount_must_be_positive");
  if (amt > 10000000) throw new Error("amount_exceeds_maximum"); // 10M limit
  
  const refVal = ref;
  
  // CRITICAL FIX: Use row-level locking to prevent race conditions
  const res = await sql.transaction(async (txn) => {
    // Step 1: Lock the wallet row and check current balance
    const walletLock = await txn`
      SELECT id, balance, user_id 
      FROM wallets 
      WHERE id = ${walletId} 
      FOR UPDATE
    `;
    
    if (!walletLock || !walletLock[0]) {
      throw new Error("Wallet not found or could not be locked");
    }
    
    const currentBalance = Number(walletLock[0].balance || 0);
    const userId = walletLock[0].user_id;
    
    // Step 2: For debit operations, ensure sufficient balance
    if (entryType === 'debit' && currentBalance < amt) {
      throw new Error("insufficient_funds");
    }
    
    // Step 3: Calculate new balance
    const newBalance = entryType === 'credit' 
      ? currentBalance + amt 
      : currentBalance - amt;
    
    // Step 4: Prevent negative balances (additional safety check)
    if (newBalance < 0) {
      throw new Error("operation_would_result_in_negative_balance");
    }
    
    // Step 5: Insert ledger entry with idempotency check
    const ledgerInsert = await txn`
      INSERT INTO wallet_ledger (
        wallet_id, counterparty_wallet_id, entry_type, amount, currency, 
        status, ref, external_ref, narration, metadata, created_at, balance_after
      )
      VALUES (
        ${walletId}, ${counterpartyWalletId}, ${entryType}, ${amt}, ${currency},
        'posted', ${refVal}, ${externalRef}, ${narration}, 
        ${JSON.stringify(metadata || {})}::jsonb, now(), ${newBalance}
      )
      ON CONFLICT (ref) DO NOTHING
      RETURNING id, balance_after
    `;
    
    // Step 6: If ledger insert was skipped due to conflict, return existing
    if (!ledgerInsert || !ledgerInsert[0]) {
      const existing = await txn`
        SELECT id, balance_after FROM wallet_ledger WHERE ref = ${refVal} LIMIT 1
      `;
      return [{
        ledger_id: existing?.[0]?.id || null,
        balance_after: existing?.[0]?.balance_after || null,
        user_id: userId,
        conflict: true
      }];
    }
    
    // Step 7: Update wallet balance atomically
    const walletUpdate = await txn`
      UPDATE wallets 
      SET balance = ${newBalance}, updated_at = now() 
      WHERE id = ${walletId}
      RETURNING balance, user_id
    `;
    
    // Step 8: Update ledger with posted timestamp
    await txn`
      UPDATE wallet_ledger 
      SET posted_at = now() 
      WHERE id = ${ledgerInsert[0].id}
    `;
    
    return [{
      ledger_id: ledgerInsert[0].id,
      balance_after: newBalance,
      user_id: userId,
      conflict: false
    }];
  });
  
  const row = res?.[0];
  if (!row) {
    throw new Error("Transaction failed unexpectedly");
  }
  
  // Invalidate cache after balance update (outside transaction)
  try {
    const { invalidateWalletCache, setCachedBalance } = await import("@apps-lib/cache/walletCache.js");
    
    if (row.user_id && row.balance_after !== null && !row.conflict) {
      // Invalidate old cache
      await invalidateWalletCache(walletId, row.user_id);
      
      // Update cache with new balance
      await setCachedBalance(walletId, row.user_id, currency, row.balance_after);
    }
  } catch (error) {
    // Don't fail the operation if cache update fails
    console.error("[Wallet] Cache invalidation error:", error);
  }
  
  return {
    ledger_id: row.ledger_id,
    balance_after: row.balance_after,
    conflict: row.conflict || false,
  };
}

export async function listUserLedger({ userId, limit = 20, cursor = null }) {
  // Validate and sanitize inputs
  if (!userId) throw new Error("userId is required");
  
  const params = [userId];
  let query = `
    SELECT l.*, w.user_id 
    FROM wallet_ledger l 
    JOIN wallets w ON w.id = l.wallet_id 
    WHERE w.user_id = $1
  `;
  
  // Add cursor filter with proper parameterization
  if (cursor) {
    try {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        throw new Error("Invalid cursor date format");
      }
      query += ` AND l.created_at < $2`;
      params.push(cursorDate);
    } catch (error) {
      throw new Error("Invalid cursor parameter");
    }
  }
  
  // Add ordering and limit with proper parameterization
  query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1}`;
  
  // Cap limit to prevent abuse and validate
  const sanitizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  params.push(sanitizedLimit);
  
  const rows = await sql(query, params);
  return rows || [];
}