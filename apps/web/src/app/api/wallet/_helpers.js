import sql from "@/app/api/utils/sql";

export async function getOrCreateWallet(userId, currency = "KES") {
  const ccy = currency || "KES";
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
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rnd}`;
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
  // Atomically insert ledger and update wallet balance
  const amt = Number(amount || 0);
  if (!(amt > 0)) throw new Error("amount_must_be_positive");
  const refVal = ref;
  const res = await sql.transaction((txn) => [
    txn(
      "WITH ins AS (\n        INSERT INTO wallet_ledger (wallet_id, counterparty_wallet_id, entry_type, amount, currency, status, ref, external_ref, narration, metadata, created_at)\n        VALUES ($1,$2,$3,$4,$5,'posted',$6,$7,$8,$9::jsonb, now())\n        ON CONFLICT (ref) DO NOTHING\n        RETURNING id\n      ), upd AS (\n        UPDATE wallets w\n        SET balance = CASE WHEN $3 = 'credit' THEN w.balance + $4 ELSE w.balance - $4 END, updated_at = now()\n        WHERE w.id = $1\n        RETURNING w.balance, w.user_id\n      )\n      SELECT (SELECT id FROM ins) AS ledger_id, (SELECT balance FROM upd) AS balance_after, (SELECT user_id FROM upd) AS user_id",
      [
        walletId,
        counterpartyWalletId,
        entryType,
        amt,
        currency,
        refVal,
        externalRef,
        narration,
        JSON.stringify(metadata || {}),
      ],
    ),
  ]);
  const row = res?.[0]?.[0];
  if (!row || !row.ledger_id) {
    // If conflict on ref, fetch existing
    const existing = await sql(
      "SELECT id FROM wallet_ledger WHERE ref = $1 LIMIT 1",
      [refVal],
    );
    return {
      ledger_id: existing?.[0]?.id || null,
      balance_after: null,
      conflict: true,
    };
  }
  // Update balance_after on ledger row for traceability
  await sql(
    "UPDATE wallet_ledger SET balance_after = $1, posted_at = now() WHERE id = $2",
    [res?.[0]?.[0]?.balance_after, row.ledger_id],
  );
  
  // Invalidate cache after balance update
  try {
    const { invalidateWalletCache, setCachedBalance } = await import("@apps-lib/cache/walletCache.js");
    const userId = row.user_id || res?.[0]?.[0]?.user_id;
    const newBalance = res?.[0]?.[0]?.balance_after;
    
    if (userId && newBalance !== null) {
      // Invalidate old cache
      await invalidateWalletCache(walletId, userId);
      
      // Update cache with new balance
      await setCachedBalance(walletId, userId, currency, newBalance);
    }
  } catch (error) {
    // Don't fail the transaction if cache update fails
    console.error("[Wallet] Cache invalidation error:", error);
  }
  
  return {
    ledger_id: row.ledger_id,
    balance_after: res?.[0]?.[0]?.balance_after,
    conflict: false,
  };
}

export async function listUserLedger({ userId, limit = 20, cursor = null }) {
  const q = [];
  const v = [];
  let pi = 1;
  q.push(
    `SELECT l.*, w.user_id FROM wallet_ledger l JOIN wallets w ON w.id = l.wallet_id WHERE w.user_id = $${pi++}`,
  );
  v.push(userId);
  if (cursor) {
    q.push(` AND l.created_at < $${pi++}`);
    v.push(new Date(cursor));
  }
  q.push(` ORDER BY l.created_at DESC LIMIT $${pi++}`);
  v.push(Number(limit) || 20);
  const rows = await sql(q.join(""), v);
  return rows;
}
