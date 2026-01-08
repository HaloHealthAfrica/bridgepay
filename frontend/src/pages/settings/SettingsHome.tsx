import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CreditCard, FileText, Lock, Moon, Shield, Smartphone, User } from "lucide-react";
import { kycAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import { SecondaryButton } from "../../components/ui/Buttons";

function KycPill({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const cfg =
    s === "VERIFIED"
      ? { cls: "bg-green-50 text-green-700 border-green-200", label: "Verified" }
      : s === "REJECTED"
        ? { cls: "bg-red-50 text-red-700 border-red-200", label: "Rejected" }
        : s === "PENDING"
          ? { cls: "bg-orange-50 text-orange-700 border-orange-200", label: "Pending Review" }
          : { cls: "bg-gray-100 text-gray-700 border-gray-200", label: "Incomplete" };

  return <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>{cfg.label}</span>;
}

function SettingsItem({
  icon: Icon,
  title,
  subtitle,
  to,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 p-4 bg-surface rounded-button mb-2 border border-gray-200 hover:bg-background transition"
    >
      <div className="bg-primary-light rounded-lg p-3">
        <Icon size={20} className="text-primary" />
      </div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        {subtitle ? <div className="text-xs text-text-secondary mt-1">{subtitle}</div> : null}
      </div>
      <span className="text-text-secondary">→</span>
    </Link>
  );
}

export function SettingsHome() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [kycStatus, setKycStatus] = useState(user?.kycStatus || "INCOMPLETE");

  useEffect(() => {
    (async () => {
      try {
        const k = await kycAPI.me();
        setKycStatus(k.data.data.kyc.status);
      } catch {
        // ignore
      }
    })();
  }, []);

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings & Profile</h1>
        <p className="text-text-secondary">Manage your account and preferences</p>
      </div>

      <div className="bg-surface rounded-card p-6 border border-gray-200 mb-6">
        <div className="flex flex-wrap gap-5 items-center">
          <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center text-3xl font-extrabold text-primary">
            {initials || "U"}
          </div>

          <div className="flex-1 min-w-[220px]">
            <div className="text-2xl font-extrabold">{user.name}</div>
            <div className="text-sm text-text-secondary mt-1">
              {user.email} • {user.phone}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <KycPill status={kycStatus} />
              {kycStatus === "INCOMPLETE" ? (
                <button
                  type="button"
                  className="text-primary font-semibold text-sm hover:underline"
                  onClick={() => navigate("/settings/kyc")}
                >
                  Complete KYC →
                </button>
              ) : null}
            </div>
          </div>

          <SecondaryButton onClick={() => navigate("/settings/profile")}>Edit Profile</SecondaryButton>
        </div>
      </div>

      {(user.role === "MERCHANT" || user.role === "IMPLEMENTER") ? (
        <div className="bg-primary-light rounded-card p-5 border border-primary/10 mb-6">
          <div className="font-extrabold text-primary mb-1">Next steps</div>
          <div className="text-sm text-text-secondary mb-3">Finish setup to unlock the best experience.</div>
          <div className="flex flex-wrap gap-3">
            {user.role === "MERCHANT" ? (
              <button
                type="button"
                className="bg-primary text-white px-5 py-3 rounded-button font-semibold shadow-button"
                onClick={() => navigate("/merchant")}
              >
                Open Merchant Console
              </button>
            ) : null}
            {user.role === "IMPLEMENTER" ? (
              <button
                type="button"
                className="bg-primary text-white px-5 py-3 rounded-button font-semibold shadow-button"
                onClick={() => navigate("/settings/profile")}
              >
                Complete Implementer Profile
              </button>
            ) : null}
            {kycStatus !== "VERIFIED" ? (
              <button
                type="button"
                className="bg-surface border-2 border-primary text-primary px-5 py-3 rounded-button font-semibold"
                onClick={() => navigate("/settings/kyc")}
              >
                Complete KYC
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mb-6">
        <div className="text-lg font-bold mb-3">Account Settings</div>
        <SettingsItem icon={User} title="Personal Information" subtitle="Name, email, phone number" to="/settings/profile" />
        <SettingsItem icon={FileText} title="KYC Verification" subtitle={kycStatus === "VERIFIED" ? "Verified ✓" : "Complete verification"} to="/settings/kyc" />
        <SettingsItem icon={CreditCard} title="Connected Accounts" subtitle="M-Pesa, Paybill, Bank (A2P), Diaspora rails" to="/settings/accounts" />
      </div>

      <div className="mb-6">
        <div className="text-lg font-bold mb-3">Security</div>
        <SettingsItem icon={Lock} title="Change Password" subtitle="(next)" to="/settings/password" />
        <SettingsItem icon={Shield} title="Two-Factor Authentication" subtitle="(next)" to="/settings/2fa" />
        <SettingsItem icon={Smartphone} title="Active Sessions" subtitle="Manage logged in devices" to="/settings/sessions" />
      </div>

      <div className="mb-6">
        <div className="text-lg font-bold mb-3">Preferences</div>
        <SettingsItem icon={Bell} title="Notification Preferences" subtitle="(UI only)" to="/settings/notification-settings" />
        <SettingsItem icon={Moon} title="Theme" subtitle="Light mode (UI only)" to="/settings/theme" />
      </div>
    </div>
  );
}


