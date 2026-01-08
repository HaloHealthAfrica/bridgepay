import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle, Shield, FileText, ArrowDownLeft } from "lucide-react";
import { notificationAPI } from "../../services/api";
import { SecondaryButton } from "../../components/ui/Buttons";

function NotificationIcon({ type }: { type: string }) {
  const t = String(type || "").toUpperCase();
  const Icon =
    t === "PAYMENT" ? ArrowDownLeft : t === "SECURITY" ? Shield : t === "KYC" ? FileText : t === "PROJECT" ? CheckCircle : Bell;
  return <Icon size={20} className="text-primary" />;
}

export function Notifications() {
  const [filter, setFilter] = useState<"all" | "unread" | "payment" | "security" | "project">("all");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await notificationAPI.list({ page: 1, limit: 50 });
        setItems(res.data.data.notifications || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filter === "all") return true;
      if (filter === "unread") return !n.read;
      return String(n.type || "").toLowerCase() === filter;
    });
  }, [items, filter]);

  const markAll = async () => {
    await notificationAPI.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markOne = async (id: string) => {
    await notificationAPI.markRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Notifications</h1>
          <p className="text-text-secondary">{unreadCount ? `${unreadCount} unread notifications` : "All caught up!"}</p>
        </div>
        {unreadCount ? <SecondaryButton onClick={markAll}>Mark All as Read</SecondaryButton> : null}
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          ["all", "All"],
          ["unread", "Unread"],
          ["payment", "Payments"],
          ["security", "Security"],
          ["project", "Projects"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k as any)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm border-2 whitespace-nowrap ${
              filter === k ? "bg-primary text-white border-primary" : "bg-surface text-text border-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <Bell size={64} className="mx-auto mb-4 text-text-secondary" />
          <div className="text-lg font-semibold mb-2">No notifications</div>
          <div className="text-sm">You're all caught up!</div>
        </div>
      ) : (
        filtered.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => markOne(n.id)}
            className={`w-full text-left flex gap-4 p-4 rounded-button mb-2 transition border ${
              n.read ? "bg-surface border-gray-200" : "bg-primary-light border-primary"
            }`}
          >
            <div className="bg-surface rounded-lg p-3 flex-shrink-0">
              <NotificationIcon type={n.type} />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="font-extrabold">{n.title}</div>
                {!n.read ? <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200">New</span> : null}
              </div>
              <div className="text-sm text-text-secondary mt-1">{n.message}</div>
              <div className="text-xs text-text-secondary mt-2">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}


