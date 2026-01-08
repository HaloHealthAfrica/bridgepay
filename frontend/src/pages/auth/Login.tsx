import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password, needs2fa ? twoFactorCode : undefined);
      if (result === "2fa_required") {
        setNeeds2fa(true);
        return;
      }
      navigate("/wallet");
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
      <p className="text-text-secondary mb-6">Sign in to Bridge</p>

      <form onSubmit={onSubmit} className="bg-surface border border-gray-200 rounded-card p-6 shadow-card">
        <label className="block text-sm font-semibold mb-2">Email</label>
        <input
          className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label className="block text-sm font-semibold mb-2">Password</label>
        <input
          className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        {needs2fa && (
          <>
            <label className="block text-sm font-semibold mb-2">2FA Code</label>
            <input
              className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              inputMode="numeric"
              placeholder="123456"
              required
            />
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white py-3 rounded-button font-bold shadow-button hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <div className="text-sm text-text-secondary mt-4">
          No account?{" "}
          <Link to="/register" className="text-primary font-semibold">
            Create one
          </Link>
        </div>
      </form>
    </div>
  );
}




