import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Phone, Building2 } from "lucide-react";
import { walletAPI } from "../../services/api";
import { PrimaryButton } from "../../components/ui/Buttons";

export function Withdraw() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [method, setMethod] = useState<"mpesa" | "bank">("mpesa");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const m = (searchParams.get("method") || "").toLowerCase();
    if (m === "bank") setMethod("bank");
    if (m === "mpesa") setMethod("mpesa");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fee = useMemo(() => {
    const a = Number(amount || 0) || 0;
    if (method === "mpesa") return Math.min(a * 0.01, 50);
    return Math.min(Math.max(a * 0.01, 20), 200);
  }, [amount, method]);
  const total = useMemo(() => (Number(amount || 0) || 0) + fee, [amount, fee]);

  const onWithdraw = async () => {
    if (method === "mpesa") {
      if (!phone) return alert("Phone required");
      if (Number(amount) < 10) return alert("Minimum withdrawal is KES 10");
    } else {
      if (!bankCode || !accountNumber || !accountName) return alert("Bank details required");
      if (Number(amount) < 50) return alert("Minimum bank transfer is KES 50");
    }

    setLoading(true);
    try {
      if (method === "mpesa") {
        await walletAPI.withdrawMpesa({ phone, amount: Number(amount) });
        alert("Withdrawal initiated. You will receive M-Pesa shortly.");
      } else {
        await walletAPI.withdrawBank({
          bankCode,
          accountNumber,
          accountName,
          amount: Number(amount),
        });
        alert("Bank transfer initiated.");
      }
      navigate("/wallet");
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || "Withdrawal failed";
      if (e?.response?.status === 403 && String(msg).toLowerCase().includes("kyc")) {
        if (confirm("KYC verification is required to withdraw. Go to KYC now?")) {
          navigate("/settings/kyc");
          return;
        }
      }
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button type="button" onClick={() => navigate("/settings")} className="text-primary font-semibold mb-4 hover:underline">
        ← Back to Settings
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Withdraw Funds</h1>
        <p className="text-text-secondary">Transfer money to M-Pesa or your bank</p>
      </div>

      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-card p-8 text-white text-center mb-6">
        <div className="text-sm opacity-90 mb-2">{method === "mpesa" ? "Withdraw to M-Pesa" : "Withdraw to Bank"}</div>
        <div className="text-xs opacity-80">{method === "mpesa" ? "Fee: 1% (max KES 50)" : "Fee: 1% (min 20, max 200)"}</div>
      </div>

      <div className="bg-surface rounded-card p-6 border border-gray-200">
        <div className="mb-5">
          <div className="font-semibold mb-3">Withdrawal Method</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMethod("mpesa")}
              className={`p-4 rounded-button border-2 flex items-center gap-3 ${
                method === "mpesa" ? "border-primary bg-primary-light" : "border-gray-200 bg-surface"
              }`}
            >
              <Phone className={method === "mpesa" ? "text-primary" : "text-text-secondary"} />
              <div className="flex-1 text-left">
                <div className="font-semibold">M-Pesa</div>
                <div className="text-xs text-text-secondary">Instant payout to phone</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMethod("bank")}
              className={`p-4 rounded-button border-2 flex items-center gap-3 ${
                method === "bank" ? "border-primary bg-primary-light" : "border-gray-200 bg-surface"
              }`}
            >
              <Building2 className={method === "bank" ? "text-primary" : "text-text-secondary"} />
              <div className="flex-1 text-left">
                <div className="font-semibold">Bank Transfer (A2P)</div>
                <div className="text-xs text-text-secondary">Send from wallet to bank account</div>
              </div>
            </button>
          </div>
        </div>

        <div className="mb-5">
          {method === "mpesa" ? (
            <>
              <label className="block mb-2 font-semibold">M-Pesa Phone Number</label>
              <div className="flex gap-3 items-center">
                <Phone className="text-primary" />
                <input
                  className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0722 123 456"
                />
              </div>
            </>
          ) : (
            <>
              <label className="block mb-2 font-semibold">Bank Details</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  placeholder="Bank code (e.g. KCB)"
                />
                <input
                  className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Account number"
                />
                <input
                  className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface md:col-span-2"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Account name"
                />
              </div>
              <div className="text-xs text-text-secondary mt-2">
                Bank codes and payout rails will be finalized once WapiPay bank endpoints are configured.
              </div>
            </>
          )}
        </div>

        <div className="mb-5">
          <label className="block mb-2 font-semibold">Amount (KES)</label>
          <input className="w-full p-4 text-2xl font-extrabold border-2 border-gray-200 rounded-button bg-surface" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Enter amount" />
        </div>

        <div className="bg-primary-light rounded-card p-4 mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-text-secondary">Withdrawal Amount</span>
            <span className="font-semibold">KES {(Number(amount || 0) || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-text-secondary">Transaction Fee (1%)</span>
            <span className="font-semibold">KES {fee.toLocaleString()}</span>
          </div>
          <div className="h-px bg-primary/20 my-3" />
          <div className="flex justify-between text-lg font-extrabold text-primary">
            <span>Total Deducted</span>
            <span>KES {total.toLocaleString()}</span>
          </div>
        </div>

        <PrimaryButton icon={Download} fullWidth onClick={onWithdraw} disabled={loading}>
          {loading ? "Processing..." : method === "mpesa" ? "Withdraw to M-Pesa" : "Withdraw to Bank"}
        </PrimaryButton>
      </div>
    </div>
  );
}




