import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AddMoney } from "./pages/wallet/AddMoney";
import { WalletHome } from "./pages/wallet/WalletHome";
import { SendMoney } from "./pages/wallet/SendMoney";
import { History } from "./pages/wallet/History";
import { QRPay } from "./pages/wallet/QRPay";
import { ProjectsList } from "./pages/projects/ProjectsList";
import { ProjectDetail } from "./pages/projects/ProjectDetail";
import { CreateProject } from "./pages/projects/CreateProject";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { ProtectedRoute, RoleRoute } from "./routes/ProtectedRoute";
import { useAuthStore } from "./store/auth.store";
import { useEffect } from "react";
import { SettingsHome } from "./pages/settings/SettingsHome";
import { EditProfile } from "./pages/settings/EditProfile";
import { KYC } from "./pages/settings/KYC";
import { Notifications } from "./pages/settings/Notifications";
import { Withdraw } from "./pages/settings/Withdraw";
import { Sessions } from "./pages/settings/Sessions";
import { Placeholder } from "./pages/settings/Placeholder";
import { AdminConsole } from "./pages/admin/AdminConsole";
import { MerchantDashboard } from "./pages/merchant/MerchantDashboard";
import { MerchantPay } from "./pages/pay/MerchantPay";
import { Landing } from "./pages/Landing";
import { LegalPage } from "./pages/Legal";
import { KycVerifierConsole } from "./pages/kyc/KycVerifierConsole";

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="min-h-full">
      <header className="bg-surface border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-bold text-xl text-primary">
            Bridge
          </Link>
          <nav className="flex gap-4 text-sm">
            {user ? (
              <>
                <Link to="/wallet" className="hover:text-primary">
                  Wallet
                </Link>
                <Link to="/wallet/add" className="hover:text-primary">
                  Add Money
                </Link>
                <Link to="/projects" className="hover:text-primary">
                  Projects
                </Link>
                <Link to="/settings" className="hover:text-primary">
                  Settings
                </Link>
                <Link to="/notifications" className="hover:text-primary">
                  Notifications
                </Link>
                {user.role === "ADMIN" ? (
                  <Link to="/admin" className="hover:text-primary">
                    Admin
                  </Link>
                ) : null}
                {user.role === "KYC_VERIFIER" ? (
                  <Link to="/kyc-verifier" className="hover:text-primary">
                    KYC Review
                  </Link>
                ) : null}
                {user.role === "MERCHANT" ? (
                  <Link to="/merchant" className="hover:text-primary">
                    Merchant
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="hover:text-primary"
                  onClick={async () => {
                    await logout();
                    navigate("/login");
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-primary">
                  Login
                </Link>
                <Link to="/register" className="hover:text-primary">
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {isBootstrapping ? (
          <div>Loading...</div>
        ) : (
        <Routes>
          <Route path="/" element={user ? <Navigate to="/wallet" replace /> : <Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy" element={<LegalPage title="Privacy Policy" />} />
          <Route path="/terms" element={<LegalPage title="Terms of Service" />} />

          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <WalletHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet/add"
            element={
              <ProtectedRoute>
                <AddMoney />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet/send"
            element={
              <ProtectedRoute>
                <SendMoney />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet/history"
            element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet/qr"
            element={
              <ProtectedRoute>
                <QRPay />
              </ProtectedRoute>
            }
          />

          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <ProjectsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/new"
            element={
              <ProtectedRoute>
                <CreateProject />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectDetail />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/profile"
            element={
              <ProtectedRoute>
                <EditProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/kyc"
            element={
              <ProtectedRoute>
                <KYC />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/sessions"
            element={
              <ProtectedRoute>
                <Sessions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/accounts"
            element={
              <ProtectedRoute>
                <Placeholder title="Connected Accounts" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/2fa"
            element={
              <ProtectedRoute>
                <Placeholder title="Two-Factor Authentication" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/notification-settings"
            element={
              <ProtectedRoute>
                <Placeholder title="Notification Preferences" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/password"
            element={
              <ProtectedRoute>
                <Placeholder title="Change Password" />
              </ProtectedRoute>
            }
          />

          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet/withdraw"
            element={
              <ProtectedRoute>
                <Withdraw />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <RoleRoute roles={["ADMIN"]}>
                <AdminConsole />
              </RoleRoute>
            }
          />

          <Route
            path="/kyc-verifier"
            element={
              <RoleRoute roles={["KYC_VERIFIER", "ADMIN"]}>
                <KycVerifierConsole />
              </RoleRoute>
            }
          />

          <Route
            path="/merchant"
            element={
              <RoleRoute roles={["MERCHANT"]}>
                <MerchantDashboard />
              </RoleRoute>
            }
          />

          <Route
            path="/pay/:merchantId"
            element={
              <ProtectedRoute>
                <MerchantPay />
              </ProtectedRoute>
            }
          />
        </Routes>
        )}
      </main>
    </div>
  );
}


