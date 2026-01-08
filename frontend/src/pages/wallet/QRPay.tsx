import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode } from "lucide-react";
import { merchantAPI } from "../../services/api";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Buttons";
import { useAuthStore } from "../../store/auth.store";

export function QRPay() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [qrCode, setQrCode] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.role !== "MERCHANT") return;
    (async () => {
      setLoading(true);
      try {
        const res = await merchantAPI.generateQRCode();
        setQrCode(res.data.data.qrCode);
      } catch (e: any) {
        alert(e?.response?.data?.error?.message || "Failed to generate QR code");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.role]);

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <button type="button" onClick={() => navigate("/wallet")} className="text-primary font-semibold mb-4 hover:underline">
          ← Back to Wallet
        </button>
        <h1 className="text-3xl font-bold mb-2">QR Pay</h1>
        <p className="text-text-secondary">Quick payments with QR codes</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-surface rounded-card p-8 text-center border-2 border-gray-200 hover:border-primary transition">
          <div className="w-20 h-20 rounded-full bg-primary-light mx-auto mb-4 flex items-center justify-center">
            <QrCode size={40} className="text-primary" />
          </div>
          <div className="font-bold mb-1">Generate QR</div>
          <div className="text-xs text-text-secondary">Let others pay you</div>
        </div>
        <div className="bg-surface rounded-card p-8 text-center border-2 border-gray-200 hover:border-primary transition opacity-70">
          <div className="w-20 h-20 rounded-full bg-primary-light mx-auto mb-4 flex items-center justify-center">
            <QrCode size={40} className="text-primary" />
          </div>
          <div className="font-bold mb-1">Scan QR</div>
          <div className="text-xs text-text-secondary">Pay a merchant (next)</div>
        </div>
      </div>

      <div className="bg-surface rounded-card p-10 text-center border-2 border-dashed border-gray-200">
        <div className="w-56 h-56 bg-primary-light rounded-card mx-auto mb-6 flex items-center justify-center overflow-hidden">
          {qrCode ? <img src={qrCode} alt="Bridge QR" className="w-44 h-44" /> : <QrCode size={120} className="text-primary" />}
        </div>
        <div className="text-lg font-bold mb-2">Your Payment QR Code</div>
        <div className="text-sm text-text-secondary mb-6">
          {user?.role === "MERCHANT" ? "Show this to receive payments" : "Become a merchant to generate a QR code"}
        </div>

        {user?.role === "MERCHANT" ? (
          <SecondaryButton
            onClick={() => {
              if (!qrCode) return;
              const a = document.createElement("a");
              a.href = qrCode;
              a.download = "bridge-qr.png";
              a.click();
            }}
            disabled={loading || !qrCode}
          >
            {loading ? "Generating..." : "Download QR"}
          </SecondaryButton>
        ) : (
          <PrimaryButton onClick={() => navigate("/wallet")}>Back</PrimaryButton>
        )}
      </div>
    </div>
  );
}




