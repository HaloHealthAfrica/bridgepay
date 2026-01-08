import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, BarChart3, History, QrCode, Building2, ReceiptText } from "lucide-react";
import { walletAPI, merchantAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import { WalletHeroCard } from "../../components/wallet/WalletHeroCard";
import { QuickActionCard } from "../../components/wallet/QuickActionCard";
import { TransactionDetailModal } from "../../components/wallet/TransactionDetailModal";
import { TransactionRow, type UITransaction } from "../../components/wallet/TransactionRow";

type WalletBalance = {
  balance: number;
  pendingBalance: number;
  escrowBalance: number;
  currency: string;
};

type BackendTransaction = any;

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

function mapTx(meId: string, tx: BackendTransaction): UITransaction & { backendId: string } {
  const isReceive = tx.toUserId === meId;
  const direction: UITransaction["direction"] = isReceive ? "receive" : "send";

  let title = tx.description || tx.type;
  if (tx.type === "TRANSFER" || tx.type === "PAYMENT" || tx.type === "ESCROW_RELEASE") {
    if (direction === "receive") title = `Payment from ${tx.fromUser?.name || "Someone"}`;
    else title = `Send to ${tx.toUser?.name || "Someone"}`;
  } else if (tx.type === "DEPOSIT") {
    const method = tx?.metadata?.method || tx?.metadata?.provider;
    if (method === "paybill") title = "Paybill Deposit";
    else if (method === "card" || method === "lemonade") title = "Diaspora Deposit (Card)";
    else title = tx.description || "Deposit";
  } else if (tx.type === "WITHDRAWAL") {
    const method = tx?.metadata?.method || tx?.metadata?.provider;
    if (method === "bank") title = "Bank Transfer (A2P)";
    else if (method === "mpesa_b2c" || method === "mpesa") title = "M-Pesa Send / Withdrawal";
    else title = tx.description || "Withdrawal";
  }

  return {
    backendId: tx.id,
    id: String(tx.id),
    direction,
    title,
    amount: Number(tx.amount),
    dateLabel: tx.createdAt ? timeAgo(tx.createdAt) : "",
    status: tx.status,
  };
}

export function WalletHome() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const meId = user?.id || "";

  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [txs, setTxs] = useState<BackendTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<(UITransaction & { backendId: string }) | null>(null);
  const [salesToday, setSalesToday] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [walletRes, txRes] = await Promise.all([
          walletAPI.getBalance(),
          walletAPI.getTransactions({ page: 1, limit: 3 }),
        ]);
        setWallet(walletRes.data.data);
        setTxs(txRes.data.data.transactions || []);

        if (user?.role === "MERCHANT") {
          const salesRes = await merchantAPI.getSalesStats({ period: "today" });
          setSalesToday(Number(salesRes.data.data.totalSales || 0));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.role]);

  const uiTxs = useMemo(() => (meId ? txs.map((t) => mapTx(meId, t)) : []), [meId, txs]);

  if (loading) return <div>Loading...</div>;
  if (!wallet) return <div>Unable to load wallet.</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.name || "User"}!</h1>
        <p className="text-text-secondary">Manage your money with ease</p>
      </div>

      <WalletHeroCard balance={wallet.balance} pending={wallet.pendingBalance} escrow={wallet.escrowBalance} />

      <div className="flex flex-wrap gap-4 mb-8">
        <QuickActionCard icon={ArrowDownLeft} label="Add Money" onClick={() => navigate("/wallet/add")} />
        <QuickActionCard icon={ArrowUpRight} label="Send Money" onClick={() => navigate("/wallet/send")} />
        <QuickActionCard icon={QrCode} label="QR Pay" onClick={() => navigate("/wallet/qr")} />
        <QuickActionCard icon={History} label="History" onClick={() => navigate("/wallet/history")} />
        <QuickActionCard icon={ReceiptText} label="Paybill Deposit" onClick={() => navigate("/wallet/add?method=paybill")} />
        <QuickActionCard icon={Building2} label="Bank Transfer" onClick={() => navigate("/settings/withdraw?method=bank")} />
      </div>

      {user?.role === "MERCHANT" ? (
        <div className="bg-surface rounded-card p-6 mb-6 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Today's Sales</h2>
            <BarChart3 size={20} className="text-primary" />
          </div>
          <div className="text-3xl font-extrabold text-primary mb-1">KES {(salesToday ?? 0).toLocaleString()}</div>
          <div className="text-sm text-success">Live from transactions</div>
        </div>
      ) : null}

      <div className="bg-surface rounded-card p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Recent Transactions</h2>
          <button
            type="button"
            onClick={() => navigate("/wallet/history")}
            className="text-primary text-sm font-semibold hover:underline"
          >
            View All →
          </button>
        </div>

        {uiTxs.length === 0 ? (
          <div className="text-text-secondary">No transactions yet.</div>
        ) : (
          uiTxs.map((t) => <TransactionRow key={t.id} transaction={t} onClick={() => setSelected(t)} />)
        )}
      </div>

      {selected ? (
        <TransactionDetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onReceipt={async () => {
            try {
              const res = await walletAPI.createReceipt(selected.backendId);
              const url = res.data.data.receiptUrl;
              if (url) window.open(url, "_blank");
              else alert("Receipt not available (S3 not configured).");
            } catch (e: any) {
              alert(e?.response?.data?.error?.message || "Failed to generate receipt");
            }
          }}
        />
      ) : null}
    </div>
  );
}




