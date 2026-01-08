type Props = {
  transactions: any[];
};

function formatAmount(v: any) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

export const TransactionList = ({ transactions }: Props) => {
  return (
    <div className="rounded-card bg-surface shadow-card border border-gray-100">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="font-bold">Recent Transactions</div>
        <div className="text-sm text-text-secondary">{transactions.length}</div>
      </div>

      <div className="divide-y divide-gray-100">
        {transactions.length === 0 ? (
          <div className="p-5 text-text-secondary">No transactions yet.</div>
        ) : (
          transactions.map((t) => (
            <div key={t.id} className="p-5 flex items-center justify-between">
              <div>
                <div className="font-semibold">{t.type}</div>
                <div className="text-xs text-text-secondary">{new Date(t.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="font-bold">KES {formatAmount(t.amount)}</div>
                <div className="text-xs text-text-secondary">{t.status}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};




