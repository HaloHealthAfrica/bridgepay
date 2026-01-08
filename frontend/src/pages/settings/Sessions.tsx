import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { accountAPI } from "../../services/api";

export function Sessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await accountAPI.sessions();
        setSessions(res.data.data.sessions || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <button type="button" onClick={() => navigate("/settings")} className="text-primary font-semibold mb-4 hover:underline">
        ← Back to Settings
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Active Sessions</h1>
        <p className="text-text-secondary">Devices recently logged into your account</p>
      </div>

      <div className="bg-surface rounded-card p-6 border border-gray-200">
        {loading ? (
          <div>Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="text-text-secondary">No sessions found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sessions.map((s) => (
              <div key={s.id} className="py-4 flex items-start gap-3">
                <div className="bg-primary-light rounded-lg p-3">
                  <Smartphone className="text-primary" size={20} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{s.deviceInfo || "Unknown device"}</div>
                  <div className="text-xs text-text-secondary mt-1">IP: {s.ipAddress || "—"}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    Last active: {new Date(s.lastActive).toLocaleString()}
                  </div>
                </div>
                <div className="text-xs text-text-secondary">
                  Expires: {new Date(s.expiresAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}




