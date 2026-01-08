import { useEffect, useState } from "react";
import { adminAPI } from "../../services/api";

function StatusPill({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const cls =
    s === "ACTIVE" || s === "SUCCESS" || s === "VERIFIED" || s === "RESOLVED"
      ? "bg-green-50 text-green-700 border-green-200"
      : s === "SUSPENDED" || s === "FAILED" || s === "REJECTED" || s === "OPEN"
        ? "bg-red-50 text-red-700 border-red-200"
        : s === "PENDING" || s === "INVESTIGATING"
          ? "bg-orange-50 text-orange-700 border-orange-200"
          : "bg-gray-50 text-gray-700 border-gray-200";

  return <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${cls}`}>{s}</span>;
}

export function KycVerifierConsole() {
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.kyc({ status: status || undefined, page: 1, limit: 50 });
      setItems(res.data.data.kycSubmissions || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold mb-2">KYC Review</h1>
          <p className="text-text-secondary">Approve or reject KYC submissions</p>
        </div>
        <div className="flex gap-3 items-center">
          <select
            className="p-3 border-2 border-gray-200 rounded-button bg-surface"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button className="bg-primary text-white px-5 py-3 rounded-button font-semibold shadow-button" onClick={() => void load()}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-text-secondary">{loading ? "Loading..." : "No KYC submissions found."}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((k) => (
            <div key={k.id} className="bg-surface p-6 rounded-card border border-gray-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-lg font-extrabold">{k.user?.name || "User"}</div>
                    <StatusPill status={k.status} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
                    <div>
                      <div className="text-xs text-text-secondary">Contact</div>
                      <div className="font-semibold">{k.user?.phone}</div>
                      <div>{k.user?.email}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary">ID</div>
                      <div className="font-semibold">{k.idType || "—"}</div>
                      <div>{k.idNumber || "—"}</div>
                    </div>
                  </div>

                  {k.documents ? (
                    <pre className="bg-background p-4 rounded-button overflow-auto text-xs">{JSON.stringify(k.documents, null, 2)}</pre>
                  ) : null}

                  <div className="text-xs text-text-secondary mt-3">
                    Submitted: {k.submittedAt ? new Date(k.submittedAt).toLocaleString() : "—"}
                    {k.reviewedAt ? ` • Reviewed: ${new Date(k.reviewedAt).toLocaleString()}` : ""}
                  </div>

                  {k.verifierNotes ? (
                    <div className="mt-3 p-3 rounded-button bg-red-50 border border-red-200 text-red-700 text-sm">
                      <b>Notes:</b> {k.verifierNotes}
                    </div>
                  ) : null}
                </div>

                {k.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <button
                      className="px-4 py-3 rounded-button bg-success text-white font-semibold"
                      onClick={async () => {
                        await adminAPI.reviewKyc(k.userId, "APPROVE");
                        await load();
                      }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      className="px-4 py-3 rounded-button bg-error text-white font-semibold"
                      onClick={async () => {
                        const notes = prompt("Rejection reason") || "";
                        if (!notes) return;
                        await adminAPI.reviewKyc(k.userId, "REJECT", notes);
                        await load();
                      }}
                    >
                      ✗ Reject
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


