import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CreditCard, QrCode } from "lucide-react";
import { merchantAPI } from "../../services/api";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Buttons";
import { StatusPill } from "../../components/ui/StatusPill";

type PayMethod = "wallet" | "card";

function formatKES(n: number) {
  return `KES ${n.toLocaleString()}`;
}

export function MerchantPay() {
  const { merchantId } = useParams();
  const navigate = useNavigate();

  const [merchant, setMerchant] = useState<any | null>(null);
  const [method, setMethod] = useState<PayMethod>("wallet");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const storageKey = useMemo(() => `bridge_merchant_card_txn_${merchantId}`, [merchantId]);
  const [providerTransactionId, setProviderTransactionId] = useState<string>(() => {
    if (!merchantId) return "";
    return localStorage.getItem(`bridge_merchant_card_txn_${merchantId}`) || "";
  });

  const [cardStatus, setCardStatus] = useState<any | null>(null);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const res = await merchantAPI.getMerchantPublic(merchantId);
      setMerchant(res.data.data.merchant);
    })();
  }, [merchantId]);

  const businessName = merchant?.businessName || "Merchant";

  const submitWalletPay = async () => {
    if (!merchantId) return;
    setLoading(true);
    try {
      const res = await merchantAPI.processQRPayment({ merchantId, amount: Number(amount), note: note || undefined });
      alert(`Payment successful. Ref: ${res.data.data.transaction.reference}`);
      navigate("/wallet");
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Wallet payment failed");
    } finally {
      setLoading(false);
    }
  };

  const submitCardPay = async () => {
    if (!merchantId) return;
    setLoading(true);
    try {
      const res = await merchantAPI.payByCard({ merchantId, amount: Number(amount), note: note || undefined });
      const txnId = res.data.data.providerTransactionId as string;
      const url = res.data.data.checkoutUrl as string;

      if (txnId) {
        localStorage.setItem(storageKey, txnId);
        setProviderTransactionId(txnId);
      }

      if (url) window.location.href = url;
      else alert("No redirect URL returned from provider.");
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Card payment initiation failed");
    } finally {
      setLoading(false);
    }
  };

  const checkCardStatus = async () => {
    if (!providerTransactionId) return;
    setLoading(true);
    try {
      const res = await merchantAPI.checkCardPaymentStatus(providerTransactionId);
      setCardStatus(res.data.data);
      const tx = res.data.data.transaction;
      if (tx?.status && tx.status !== "PENDING") {
        localStorage.removeItem(storageKey);
        setProviderTransactionId("");
      }
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Status check failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <button className="text-primary font-semibold" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>

      <div className="bg-surface rounded-card border border-gray-200 p-6 mb-6">
        <div className="text-2xl font-extrabold mb-1">Pay {businessName}</div>
        <div className="text-text-secondary text-sm">Choose how you want to pay this merchant</div>
      </div>

      <div className="bg-surface rounded-card border border-gray-200 p-6">
        <label className="block font-semibold mb-2">Amount (KES)</label>
        <input
          className="w-full p-4 text-2xl font-extrabold border-2 border-gray-200 rounded-button bg-background mb-4"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          type="number"
        />

        <label className="block font-semibold mb-2">Note (optional)</label>
        <input
          className="w-full p-4 border-2 border-gray-200 rounded-button bg-background mb-6"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Purchase"
        />

        <div className="font-semibold mb-3">Payment Method</div>
        <div className="flex flex-col gap-3 mb-6">
          <button
            type="button"
            onClick={() => setMethod("wallet")}
            className={`p-4 rounded-button border-2 flex items-center gap-3 ${
              method === "wallet" ? "border-primary bg-primary-light" : "border-gray-200 bg-surface"
            }`}
          >
            <QrCode className={method === "wallet" ? "text-primary" : "text-text-secondary"} />
            <div className="flex-1 text-left">
              <div className="font-semibold">Bridge Wallet</div>
              <div className="text-xs text-text-secondary">Instant wallet payment</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMethod("card")}
            className={`p-4 rounded-button border-2 flex items-center gap-3 ${
              method === "card" ? "border-primary bg-primary-light" : "border-gray-200 bg-surface"
            }`}
          >
            <CreditCard className={method === "card" ? "text-primary" : "text-text-secondary"} />
            <div className="flex-1 text-left">
              <div className="font-semibold">Card (Lemonade)</div>
              <div className="text-xs text-text-secondary">Redirect to secure payment page</div>
            </div>
          </button>
        </div>

        <div className="flex gap-3">
          {method === "wallet" ? (
            <PrimaryButton
              fullWidth
              disabled={loading || Number(amount) < 1}
              onClick={() => void submitWalletPay()}
            >
              Pay {formatKES(Number(amount || 0))}
            </PrimaryButton>
          ) : (
            <PrimaryButton
              fullWidth
              disabled={loading || Number(amount) < 1}
              onClick={() => void submitCardPay()}
            >
              Continue to Card Checkout
            </PrimaryButton>
          )}
        </div>

        {method === "card" ? (
          <div className="mt-6 bg-background rounded-button p-4 border border-gray-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Card Payment Status</div>
                <div className="text-xs text-text-secondary">
                  If you already completed checkout, click “Check Status”.
                </div>
              </div>
              <SecondaryButton onClick={() => void checkCardStatus()}>{loading ? "Checking..." : "Check Status"}</SecondaryButton>
            </div>

            {providerTransactionId ? (
              <div className="mt-3 text-xs text-text-secondary font-mono break-all">Provider Txn: {providerTransactionId}</div>
            ) : (
              <div className="mt-3 text-xs text-text-secondary">No pending provider transaction saved.</div>
            )}

            {cardStatus?.transaction ? (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm font-semibold">Bridge Tx Status</div>
                <StatusPill status={cardStatus.transaction.status} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}




