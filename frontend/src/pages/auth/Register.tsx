import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

export function Register() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "MERCHANT" | "IMPLEMENTER">("CUSTOMER");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ name, email, phone, password, role });
      navigate("/wallet");
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-3xl font-bold mb-2">Create your account</h1>
      <p className="text-text-secondary mb-6">Join Bridge in under a minute</p>

      <form onSubmit={onSubmit} className="bg-surface border border-gray-200 rounded-card p-6 shadow-card">
        <label className="block text-sm font-semibold mb-2">Full name</label>
        <input
          className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label className="block text-sm font-semibold mb-2">Email</label>
        <input
          className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label className="block text-sm font-semibold mb-2">Phone</label>
        <input
          className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0722 123 456"
          required
        />

        <label className="block text-sm font-semibold mb-2">Account type</label>
        <select
          className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
        >
          <option value="CUSTOMER">Customer</option>
          <option value="MERCHANT">Merchant</option>
          <option value="IMPLEMENTER">Implementer</option>
        </select>

        <label className="block text-sm font-semibold mb-2">Password</label>
        <input
          className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white py-3 rounded-button font-bold shadow-button hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        <div className="text-sm text-text-secondary mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-semibold">
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}




