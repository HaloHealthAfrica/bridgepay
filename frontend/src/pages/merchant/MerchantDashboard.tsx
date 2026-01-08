import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Link2, QrCode, Wallet } from "lucide-react";
import { merchantAPI, walletAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import { Modal } from "../../components/ui/Modal";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Buttons";
import { StatusPill } from "../../components/ui/StatusPill";
import { TransactionRow, type UITransaction } from "../../components/wallet/TransactionRow";
import { TransactionDetailModal } from "../../components/wallet/TransactionDetailModal";

type Tab = "dashboard" | "sales" | "customers" | "analytics" | "settings";

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

function formatKES(n: number) {
  return `KES ${n.toLocaleString()}`;
}

export function MerchantDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const meId = user?.id || "";

  const [tab, setTab] = useState<Tab>("dashboard");
  const [period, setPeriod] = useState<"today" | "7days" | "30days">("today");

  const [merchant, setMerchant] = useState<any | null>(null);
  const [wallet, setWallet] = useState<any | null>(null);
  const [sales, setSales] = useState<any | null>(null);
  const [recentTx, setRecentTx] = useState<any[]>([]);

  const [qrOpen, setQrOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const [qrCode, setQrCode] = useState<string>("");
  const [paymentUrl, setPaymentUrl] = useState<string>("");

  const [selected, setSelected] = useState<(UITransaction & { backendId: string }) | null>(null);

  useEffect(() => {
    (async () => {
      const [m, w] = await Promise.all([merchantAPI.me(), walletAPI.getBalance()]);
      setMerchant(m.data.data.user);
      setWallet(w.data.data);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const res = await merchantAPI.getSalesStats({ period });
      setSales(res.data.data);
      setRecentTx(res.data.data.transactions || []);
    })();
  }, [period]);

  const businessName = merchant?.merchantProfile?.businessName || merchant?.name || "Merchant";
  const ownerName = merchant?.name || "Owner";
  const kycStatus = merchant?.kycStatus || user?.kycStatus || "INCOMPLETE";

  const uiTxs = useMemo(() => {
    if (!meId) return [];
    return recentTx.map((t: any) => {
      const isReceive = t.toUserId === meId;
      const direction: UITransaction["direction"] = isReceive ? "receive" : "send";
      return {
        backendId: t.id,
        id: t.id,
        direction,
        title: `Payment from ${t.fromUser?.name || "Customer"}`,
        amount: Number(t.amount),
        dateLabel: t.createdAt ? timeAgo(t.createdAt) : "",
        status: t.status,
      };
    });
  }, [meId, recentTx]);

  const customersCount = useMemo(() => {
    const set = new Set<string>();
    (sales?.transactions || []).forEach((t: any) => {
      if (t.fromUserId) set.add(t.fromUserId);
    });
    return set.size;
  }, [sales]);

  const avgTx = useMemo(() => {
    const count = Number(sales?.transactionCount || 0);
    const total = Number(sales?.totalSales || 0);
    return count > 0 ? Math.round(total / count) : 0;
  }, [sales]);

  const openQr = async () => {
    setQrOpen(true);
    try {
      const res = await merchantAPI.generateQRCode();
      setQrCode(res.data.data.qrCode);
      setPaymentUrl(res.data.data.paymentUrl);
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Failed to generate QR");
    }
  };

  const openLink = async () => {
    setLinkOpen(true);
    if (paymentUrl) return;
    try {
      const res = await merchantAPI.generateQRCode();
      setQrCode(res.data.data.qrCode);
      setPaymentUrl(res.data.data.paymentUrl);
    } catch (e: any) {
      // ignore
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      alert("Copy failed");
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-surface rounded-card border border-gray-200 p-5 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-extrabold">
            B
          </div>
          <div>
            <div className="text-lg font-extrabold text-primary">Bridge</div>
            <div className="text-xs text-text-secondary">Merchant Console</div>
          </div>
          <span className="px-3 py-1 rounded-lg bg-primary-light text-primary text-xs font-semibold">MERCHANT</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-background rounded-button px-4 py-3 flex items-center gap-3">
            <Wallet className="text-text-secondary" />
            <div>
              <div className="text-xs text-text-secondary">Available Balance</div>
              <div className="text-base font-extrabold text-success">{formatKES(Number(wallet?.balance || 0))}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-button hover:bg-background transition">
            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-extrabold">
              {ownerName
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p: string) => p[0]?.toUpperCase())
                .join("") || "M"}
            </div>
            <div>
              <div className="text-sm font-semibold">{businessName}</div>
              <div className="text-xs text-text-secondary">{ownerName}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-surface rounded-card border border-gray-200 px-5">
        <div className="flex gap-8 overflow-x-auto">
          {[
            ["dashboard", "Dashboard", "📊"],
            ["sales", "Sales", "💰"],
            ["customers", "Customers", "👥"],
            ["analytics", "Analytics", "📈"],
            ["settings", "Settings", "⚙️"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as Tab)}
              className={`py-4 border-b-4 transition whitespace-nowrap flex items-center gap-2 ${
                tab === id ? "border-primary text-primary font-semibold" : "border-transparent text-text-secondary"
              }`}
            >
              <span className="text-lg">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="py-6">
        {tab === "dashboard" ? (
          <>
            {/* Quick actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <button
                type="button"
                onClick={openQr}
                className="bg-surface rounded-card border-2 border-primary p-6 text-center hover:bg-primary-light hover:-translate-y-0.5 hover:shadow-card transition"
              >
                <div className="text-4xl mb-2">📱</div>
                <div className="text-lg font-extrabold text-primary mb-1">Show QR Code</div>
                <div className="text-sm text-text-secondary">Customer scans to pay</div>
              </button>

              <button
                type="button"
                onClick={openLink}
                className="bg-surface rounded-card border-2 border-gray-200 p-6 text-center hover:bg-background hover:-translate-y-0.5 hover:shadow-card transition"
              >
                <div className="text-4xl mb-2">🔗</div>
                <div className="text-lg font-extrabold mb-1">Payment Link</div>
                <div className="text-sm text-text-secondary">Share link to receive payment</div>
              </button>

              <button
                type="button"
                onClick={() => navigate("/wallet/withdraw")}
                className="bg-surface rounded-card border-2 border-gray-200 p-6 text-center hover:bg-background hover:-translate-y-0.5 hover:shadow-card transition"
              >
                <div className="text-4xl mb-2">💸</div>
                <div className="text-lg font-extrabold mb-1">Withdraw Money</div>
                <div className="text-sm text-text-secondary">Transfer to M-Pesa</div>
              </button>
            </div>

            {/* Sales overview */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="text-2xl font-extrabold">Sales Overview</div>
              <div className="flex gap-2">
                {[
                  ["today", "Today"],
                  ["7days", "This Week"],
                  ["30days", "This Month"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`px-4 py-2 rounded-button font-semibold text-sm ${
                      period === id ? "bg-primary text-white" : "bg-background text-text"
                    }`}
                    onClick={() => setPeriod(id as any)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {[
                ["Revenue", formatKES(Number(sales?.totalSales || 0)), "💰", "text-success"],
                ["Transactions", Number(sales?.transactionCount || 0), "🧾", "text-primary"],
                ["Customers", customersCount, "👥", "text-warning"],
                ["Avg. Transaction", formatKES(avgTx), "📊", "text-text-secondary"],
              ].map(([label, value, icon, color]) => (
                <div key={label as string} className="bg-surface rounded-card border border-gray-200 p-6">
                  <div className="text-3xl mb-3">{icon}</div>
                  <div className="text-xs text-text-secondary mb-2">{label}</div>
                  <div className={`text-2xl font-extrabold ${color as string}`}>{value as any}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2 bg-surface rounded-card border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-lg font-extrabold">Recent Payments</div>
                  <button className="text-primary font-semibold text-sm hover:underline" onClick={() => setTab("sales")}>
                    View all →
                  </button>
                </div>

                {uiTxs.length === 0 ? (
                  <div className="text-text-secondary">No recent payments.</div>
                ) : (
                  uiTxs.slice(0, 5).map((t) => <TransactionRow key={t.id} transaction={t} onClick={() => setSelected(t)} />)
                )}
              </div>

              <div className="bg-success rounded-card p-6 text-white flex flex-col justify-center">
                <div className="text-5xl text-center mb-4">💵</div>
                <div className="text-center opacity-90 mb-2">Period Revenue</div>
                <div className="text-center text-3xl font-extrabold mb-3">{formatKES(Number(sales?.totalSales || 0))}</div>
                <div className="text-center text-sm opacity-80">Based on successful merchant payments</div>
              </div>
            </div>
          </>
        ) : null}

        {tab === "sales" ? (
          <div className="bg-surface rounded-card border border-gray-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="text-2xl font-extrabold">All Sales</div>
              <button className="bg-primary text-white px-4 py-2 rounded-button font-semibold shadow-button">Export CSV</button>
            </div>
            {uiTxs.length === 0 ? (
              <div className="text-text-secondary">No sales found.</div>
            ) : (
              uiTxs.map((t) => <TransactionRow key={t.id} transaction={t} onClick={() => setSelected(t)} />)
            )}
          </div>
        ) : null}

        {tab === "customers" ? (
          <div className="bg-surface rounded-card border border-gray-200 p-6">
            <div className="text-2xl font-extrabold mb-2">Customers</div>
            <div className="text-text-secondary">Coming next: customer list & repeat spend (needs dedicated backend aggregation).</div>
          </div>
        ) : null}

        {tab === "analytics" ? (
          <div className="bg-surface rounded-card border border-gray-200 p-6">
            <div className="text-2xl font-extrabold mb-2">Analytics</div>
            <div className="text-text-secondary">
              Coming next: top products, peak hours, and payment method breakdown (requires item-level data).
            </div>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="bg-surface rounded-card border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-2xl font-extrabold">Business Settings</div>
                <div className="text-text-secondary mt-1">Update your business profile</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={kycStatus} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ["Business Name", businessName],
                ["Owner", ownerName],
                ["Phone", merchant?.phone || ""],
                ["Email", merchant?.email || ""],
                ["Location", merchant?.merchantProfile?.businessAddress || "—"],
                ["Payment Methods", (merchant?.merchantProfile?.paymentMethods || []).join(", ") || "—"],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-background rounded-button p-4">
                  <div className="text-xs text-text-secondary mb-1">{label}</div>
                  <div className="font-semibold">{value as any}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* QR modal */}
      <Modal open={qrOpen} title="Scan to Pay" onClose={() => setQrOpen(false)} maxWidthClass="max-w-lg">
        <div className="text-center">
          <div className="text-5xl mb-3">📱</div>
          <div className="text-text-secondary mb-6">Customer scans this QR code to make payment</div>

          <div className="w-72 h-72 mx-auto bg-background rounded-card border-4 border-primary flex items-center justify-center overflow-hidden mb-6">
            {qrCode ? <img src={qrCode} alt="Merchant QR" className="w-64 h-64" /> : <QrCode size={120} className="text-primary" />}
          </div>

          <div className="bg-primary-light rounded-button p-4 mb-6">
            <div className="text-sm font-semibold text-primary">{businessName}</div>
            <div className="text-xs text-text-secondary mt-1">Customer will see your business name</div>
          </div>

          <div className="flex gap-3">
            <SecondaryButton fullWidth onClick={() => setQrOpen(false)}>
              Close
            </SecondaryButton>
            <PrimaryButton
              fullWidth
              icon={Download}
              onClick={() => {
                if (!qrCode) return;
                const a = document.createElement("a");
                a.href = qrCode;
                a.download = "bridge-merchant-qr.png";
                a.click();
              }}
            >
              Download QR
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Payment link modal */}
      <Modal open={linkOpen} title="Your Payment Link" onClose={() => setLinkOpen(false)} maxWidthClass="max-w-lg">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🔗</div>
          <div className="text-text-secondary">Share this link to receive payments</div>
        </div>

        <div className="bg-background rounded-button p-4 flex gap-3 items-center mb-6">
          <input
            className="flex-1 p-3 rounded-lg bg-surface border border-gray-200 font-mono text-xs"
            value={paymentUrl || "(generate QR to create link)"}
            readOnly
          />
          <button
            className="bg-primary text-white px-4 py-3 rounded-button font-semibold"
            onClick={() => paymentUrl && void copy(paymentUrl)}
            disabled={!paymentUrl}
          >
            Copy
          </button>
        </div>

        <div className="bg-primary-light rounded-button p-4 text-sm mb-6 text-left">
          <div className="font-semibold text-primary mb-2">How it works</div>
          <ul className="list-disc ml-5 text-text">
            <li>Share via WhatsApp/SMS</li>
            <li>Customer pays via Bridge flow</li>
            <li>You get notified instantly</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <SecondaryButton fullWidth onClick={() => setLinkOpen(false)}>
            Close
          </SecondaryButton>
          <PrimaryButton
            fullWidth
            icon={Link2}
            onClick={() => {
              if (!paymentUrl) return;
              void copy(paymentUrl);
            }}
          >
            Copy Link
          </PrimaryButton>
        </div>
      </Modal>

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


