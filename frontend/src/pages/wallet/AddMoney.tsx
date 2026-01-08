import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, Phone, CreditCard, ReceiptText, Copy } from "lucide-react";
import { walletAPI } from "../../services/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PrimaryButton } from "../../components/ui/Buttons";

export const AddMoney = () => {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"mpesa" | "card" | "paybill">("mpesa");
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [cardProviderTxn, setCardProviderTxn] = useState<string>(() => localStorage.getItem("bridge_card_topup_txn") || "");
  const [cardStatus, setCardStatus] = useState<any | null>(null);
  const [paybillInfo, setPaybillInfo] = useState<any | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const quickAmounts = [500, 1000, 2000, 5000];

  const selectedMethodFromQuery = useMemo(() => {
    const m = (searchParams.get("method") || "").toLowerCase();
    if (m === "paybill") return "paybill";
    if (m === "card") return "card";
    if (m === "mpesa") return "mpesa";
    return null;
  }, [searchParams]);

  const pollPaymentStatus = (requestID: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    const interval = window.setInterval(async () => {
      attempts++;
      try {
        const { data } = await walletAPI.checkPaymentStatus(requestID);

        if (data.data.ResultCode === "0") {
          window.clearInterval(interval);
          setPolling(false);
          alert("Payment successful!");
          navigate("/wallet");
        } else if (data.data.ResultCode) {
          window.clearInterval(interval);
          setPolling(false);
          alert("Payment failed");
        }

        if (attempts >= maxAttempts) {
          window.clearInterval(interval);
          setPolling(false);
          alert("Payment status check timeout");
        }
      } catch {
        if (attempts >= maxAttempts) {
          window.clearInterval(interval);
          setPolling(false);
        }
      }
    }, 1000);
  };

  const handleMpesaDeposit = async () => {
    setLoading(true);
    try {
      const { data } = await walletAPI.depositMpesa({ amount: Number(amount), phone });
      const checkoutRequestID = data.data.transaction.checkoutRequestID ?? data.data.checkoutRequestID;
      if (checkoutRequestID) {
        setPolling(true);
        pollPaymentStatus(checkoutRequestID);
      }
    } catch (error: any) {
      alert(error?.response?.data?.error?.message || "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCardDeposit = async () => {
    setLoading(true);
    try {
      const { data } = await walletAPI.depositCard({ amount: Number(amount) });
      const providerTxn = data.data.providerTransactionId as string | undefined;
      if (providerTxn) {
        localStorage.setItem("bridge_card_topup_txn", providerTxn);
        setCardProviderTxn(providerTxn);
      }
      window.location.href = data.data.checkoutUrl;
    } catch (error: any) {
      alert(error?.response?.data?.error?.message || "Failed to create checkout");
    } finally {
      setLoading(false);
    }
  };

  const handlePaybillDeposit = async () => {
    setLoading(true);
    try {
      const res = await walletAPI.depositPaybill({ amount: Number(amount) });
      setPaybillInfo(res.data.data);
      alert("Paybill instructions generated. Complete the Paybill payment, then wait for confirmation.");
    } catch (error: any) {
      alert(error?.response?.data?.error?.message || "Failed to create Paybill instructions");
    } finally {
      setLoading(false);
    }
  };

  const checkCardTopupStatus = async () => {
    if (!cardProviderTxn) return;
    setLoading(true);
    try {
      const res = await walletAPI.checkCardPaymentStatus(cardProviderTxn);
      setCardStatus(res.data.data);
      const tx = res.data.data.transaction;
      if (tx?.status && tx.status !== "PENDING") {
        localStorage.removeItem("bridge_card_topup_txn");
        setCardProviderTxn("");
      }
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || "Status check failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMethodFromQuery) setMethod(selectedMethodFromQuery);
    // If user navigates with ?method=card and we have a pending txn, do a quick status check.
    if ((selectedMethodFromQuery || method) === "card" && cardProviderTxn) {
      void checkCardTopupStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(amount) < 1) return alert("Minimum amount is KES 1");
    if (method === "mpesa") {
      if (!phone) return alert("Phone number required");
      await handleMpesaDeposit();
    } else if (method === "card") {
      await handleCardDeposit();
    } else {
      await handlePaybillDeposit();
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <button
          type="button"
          onClick={() => navigate("/wallet")}
          className="text-primary font-semibold mb-4 hover:underline"
        >
          ← Back to Wallet
        </button>
        <h1 className="text-3xl font-bold mb-2">Add Money</h1>
        <p className="text-text-secondary">Fund your Bridge wallet</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface rounded-card p-6 border border-gray-200 mb-6">
        <label className="block mb-2 font-semibold">Amount (KES)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          className="w-full p-4 text-2xl font-extrabold border-2 border-gray-200 rounded-button bg-surface mb-6"
          required
        />

        <div className="mb-6">
          <div className="font-semibold mb-3">Quick Amounts</div>
          <div className="flex flex-wrap gap-2">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String(amt))}
                className="px-4 py-3 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary-light"
              >
                KES {amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <div className="font-semibold mb-3">Payment Method</div>
          <div className="flex flex-col gap-3">
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
                <div className="text-xs text-text-secondary">STK Push to your phone</div>
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
                <div className="font-semibold">Diaspora (Card)</div>
                <div className="text-xs text-text-secondary">Visa, Mastercard</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMethod("paybill")}
              className={`p-4 rounded-button border-2 flex items-center gap-3 ${
                method === "paybill" ? "border-primary bg-primary-light" : "border-gray-200 bg-surface"
              }`}
            >
              <ReceiptText className={method === "paybill" ? "text-primary" : "text-text-secondary"} />
              <div className="flex-1 text-left">
                <div className="font-semibold">Paybill</div>
                <div className="text-xs text-text-secondary">Manual Paybill deposit (C2B)</div>
              </div>
            </button>
          </div>
        </div>

        {method === "mpesa" ? (
          <div className="mb-6">
            <label className="block mb-2 font-semibold">M-Pesa Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0722 123 456"
              className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
              required
            />
          </div>
        ) : null}

        {polling ? (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-card">
            <div className="font-semibold">Waiting for payment...</div>
            <div className="text-sm mt-1">Check your phone for M-Pesa prompt</div>
          </div>
        ) : null}

        {method === "card" ? (
          <div className="mb-6 bg-background border border-gray-200 rounded-button p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Card Top-up Status</div>
                <div className="text-xs text-text-secondary">If you completed checkout, click “Check Status”.</div>
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-button bg-primary text-white font-semibold disabled:opacity-50"
                onClick={() => void checkCardTopupStatus()}
                disabled={!cardProviderTxn || loading}
              >
                {loading ? "Checking..." : "Check Status"}
              </button>
            </div>
            {cardProviderTxn ? (
              <div className="mt-3 text-xs text-text-secondary font-mono break-all">Provider Txn: {cardProviderTxn}</div>
            ) : (
              <div className="mt-3 text-xs text-text-secondary">No pending provider transaction saved.</div>
            )}
            {cardStatus?.transaction ? (
              <div className="mt-3 text-xs">
                Current status: <span className="font-semibold">{cardStatus.transaction.status}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {method === "paybill" ? (
          <div className="mb-6 bg-background border border-gray-200 rounded-button p-4">
            <div className="font-semibold mb-1">Paybill Instructions</div>
            <div className="text-xs text-text-secondary mb-3">
              Use these details in M-Pesa Paybill. Your wallet will update after confirmation.
            </div>

            {paybillInfo ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-surface border border-gray-200 rounded-button p-3">
                    <div className="text-xs text-text-secondary mb-1">Business Number</div>
                    <div className="font-bold">{paybillInfo.paybill}</div>
                    <button
                      type="button"
                      className="mt-2 text-primary text-sm font-semibold inline-flex items-center gap-2"
                      onClick={async () => {
                        await navigator.clipboard.writeText(String(paybillInfo.paybill));
                        alert("Copied Business Number");
                      }}
                    >
                      <Copy size={16} /> Copy
                    </button>
                  </div>

                  <div className="bg-surface border border-gray-200 rounded-button p-3">
                    <div className="text-xs text-text-secondary mb-1">Account Number</div>
                    <div className="font-bold">{paybillInfo.accountReference}</div>
                    <button
                      type="button"
                      className="mt-2 text-primary text-sm font-semibold inline-flex items-center gap-2"
                      onClick={async () => {
                        await navigator.clipboard.writeText(String(paybillInfo.accountReference));
                        alert("Copied Account Number");
                      }}
                    >
                      <Copy size={16} /> Copy
                    </button>
                  </div>
                </div>

                <div className="bg-surface border border-gray-200 rounded-button p-3">
                  <div className="text-xs text-text-secondary mb-2">Steps</div>
                  <ol className="list-decimal pl-5 text-sm text-text-secondary space-y-1">
                    {(paybillInfo.instructions || []).map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>

                <button
                  type="button"
                  className="w-full px-4 py-3 rounded-button bg-surface border border-gray-200 font-semibold hover:border-primary hover:text-primary"
                  onClick={() => navigate("/wallet/history")}
                >
                  View History
                </button>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">
                Click “Generate Paybill Instructions” below to get your Business/Account numbers.
              </div>
            )}
          </div>
        ) : null}

        <PrimaryButton
          type="submit"
          icon={ArrowDownLeft}
          fullWidth
          disabled={loading || polling}
        >
          {loading
            ? "Processing..."
            : method === "mpesa"
              ? "Add Money via M-Pesa"
              : method === "card"
                ? "Continue to Card Checkout"
                : "Generate Paybill Instructions"}
        </PrimaryButton>
      </form>

      {method === "mpesa" ? (
        <div className="bg-orange-50 border border-orange-200 rounded-button p-4 text-sm text-orange-700">
          💡 You&apos;ll receive an M-Pesa prompt on your phone. Enter your PIN to complete the transaction.
        </div>
      ) : method === "paybill" ? (
        <div className="bg-blue-50 border border-blue-200 rounded-button p-4 text-sm text-blue-800">
          💡 Paybill deposits can take a moment to confirm. Keep the Account Number exactly as provided.
        </div>
      ) : null}
    </div>
  );
};


