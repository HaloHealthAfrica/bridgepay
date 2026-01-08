import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "../../services/api";

type Section =
  | "dashboard"
  | "users"
  | "transactions"
  | "wallets"
  | "kyc"
  | "disputes"
  | "payments"
  | "transfers"
  | "reports"
  | "settings";

function formatKES(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}

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

export function AdminConsole() {
  const [active, setActive] = useState<Section>("dashboard");
  const [stats, setStats] = useState<any | null>(null);

  const [userQuery, setUserQuery] = useState("");
  const [userRole] = useState<string>("");
  const [userStatus, setUserStatus] = useState<string>("");
  const [userKyc, setUserKyc] = useState<string>("");
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const [txnQuery, setTxnQuery] = useState("");
  const [txnType, setTxnType] = useState<string>("");
  const [txnStatus, setTxnStatus] = useState<string>("");
  const [txns, setTxns] = useState<any[]>([]);

  const [wallets, setWallets] = useState<any[]>([]);

  const [kycStatus, setKycStatus] = useState<string>("");
  const [kyc, setKyc] = useState<any[]>([]);

  const [disputes, setDisputes] = useState<any[]>([]);

  const loadDashboard = async () => {
    const res = await adminAPI.stats();
    setStats(res.data.data);
  };

  const loadUsers = async () => {
    const res = await adminAPI.users({ q: userQuery || undefined, role: userRole || undefined, status: userStatus || undefined, kycStatus: userKyc || undefined, page: 1, limit: 50 });
    setUsers(res.data.data.users || []);
  };

  const loadTransactions = async () => {
    const res = await adminAPI.transactions({ q: txnQuery || undefined, type: txnType || undefined, status: txnStatus || undefined, page: 1, limit: 50 });
    setTxns(res.data.data.transactions || []);
  };

  const loadWallets = async () => {
    const res = await adminAPI.wallets({ page: 1, limit: 50 });
    setWallets(res.data.data.wallets || []);
  };

  const loadKyc = async () => {
    const res = await adminAPI.kyc({ status: kycStatus || undefined, page: 1, limit: 50 });
    setKyc(res.data.data.kycSubmissions || []);
  };

  const loadDisputes = async () => {
    const res = await adminAPI.disputes({ page: 1, limit: 50 });
    setDisputes(res.data.data.disputes || []);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (active === "users") void loadUsers();
    if (active === "transactions" || active === "payments" || active === "transfers") void loadTransactions();
    if (active === "wallets") void loadWallets();
    if (active === "kyc") void loadKyc();
    if (active === "disputes") void loadDisputes();
  }, [active]);

  const filteredTxns = useMemo(() => {
    if (active === "payments") return txns.filter((t) => t.type === "DEPOSIT" || t.type === "PAYMENT");
    if (active === "transfers") return txns.filter((t) => t.type === "TRANSFER");
    return txns;
  }, [active, txns]);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-[260px] bg-surface border-r border-gray-200 overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="text-2xl font-extrabold text-primary">Bridge Admin</div>
        </div>
        <div className="p-4">
          {[
            ["dashboard", "Dashboard", "📊"],
            ["users", "Users", "👥"],
            ["transactions", "Transactions", "💳"],
            ["payments", "Payments", "💰"],
            ["transfers", "Transfers", "↔️"],
            ["wallets", "Wallets", "👛"],
            ["kyc", "KYC", "✓"],
            ["disputes", "Disputes", "⚠️"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id as Section)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-button mb-1 transition ${
                active === id ? "bg-primary-light text-primary font-semibold" : "text-text hover:bg-background"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                <span>{label}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="ml-[260px] p-8">
        {active === "dashboard" ? (
          <div>
            <h2 className="text-3xl font-extrabold mb-6">Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {stats
                ? [
                    ["Total Users", stats.totalUsers, "👥", "text-primary"],
                    ["Merchants", stats.merchants, "🏪", "text-success"],
                    ["Total Transactions", stats.totalTransactions, "💳", "text-warning"],
                    ["Transaction Volume", formatKES(stats.transactionVolume), "💰", "text-error"],
                    ["Platform Balance", formatKES(stats.platformBalance), "🏦", "text-primary"],
                    ["Escrow Balance", formatKES(stats.escrowBalance), "🔒", "text-warning"],
                    ["Pending KYC", stats.pendingKYC, "✓", "text-warning"],
                    ["Active Disputes", stats.activeDisputes, "⚠️", "text-error"],
                  ].map(([label, value, icon, color]) => (
                    <div key={label as string} className="bg-surface p-6 rounded-card border border-gray-200">
                      <div className="text-3xl mb-3">{icon}</div>
                      <div className="text-xs text-text-secondary mb-1">{label}</div>
                      <div className={`text-2xl font-extrabold ${color as string}`}>{value as any}</div>
                    </div>
                  ))
                : null}
            </div>
          </div>
        ) : null}

        {active === "users" ? (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <h2 className="text-3xl font-extrabold">Users Management</h2>
              <button className="bg-primary text-white px-5 py-3 rounded-button font-semibold shadow-button">+ Add User</button>
            </div>

            <div className="bg-surface p-6 rounded-card border border-gray-200 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input className="p-3 border-2 border-gray-200 rounded-button" placeholder="Search..." value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                <select className="p-3 border-2 border-gray-200 rounded-button" value={userStatus} onChange={(e) => setUserStatus(e.target.value)}>
                  <option value="">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
                <select className="p-3 border-2 border-gray-200 rounded-button" value={userKyc} onChange={(e) => setUserKyc(e.target.value)}>
                  <option value="">All KYC</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="PENDING">Pending</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="INCOMPLETE">Incomplete</option>
                </select>
                <button className="bg-primary text-white rounded-button font-semibold" onClick={() => void loadUsers()}>
                  Apply
                </button>
              </div>
            </div>

            <div className="bg-surface rounded-card border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-background text-text-secondary">
                    <tr>
                      {["User", "Contact", "Role", "KYC", "Status", "Balance", "Escrow"].map((h) => (
                        <th key={h} className="text-left font-semibold px-4 py-3 border-b border-gray-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-100 hover:bg-background cursor-pointer" onClick={() => setSelectedUser(u)}>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{u.name}</div>
                          {u.businessName ? <div className="text-xs text-text-secondary">{u.businessName}</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div>{u.email}</div>
                          <div className="text-xs text-text-secondary">{u.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-light text-primary">{u.role}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={u.kycStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={u.status} />
                        </td>
                        <td className="px-4 py-3 font-semibold">{formatKES(u.balance)}</td>
                        <td className="px-4 py-3 font-semibold text-warning">{formatKES(u.escrowBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* User modal */}
            {selectedUser ? (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4" onClick={() => setSelectedUser(null)}>
                <div className="bg-surface rounded-card p-8 w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <div className="text-2xl font-extrabold mb-2">{selectedUser.name}</div>
                      <div className="flex gap-2 flex-wrap">
                        <StatusPill status={selectedUser.role} />
                        <StatusPill status={selectedUser.kycStatus} />
                        <StatusPill status={selectedUser.status} />
                      </div>
                    </div>
                    <button className="px-3 py-2 rounded-button bg-background" onClick={() => setSelectedUser(null)}>
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-background rounded-button p-4">
                      <div className="text-xs text-text-secondary mb-1">Email</div>
                      <div className="font-semibold">{selectedUser.email}</div>
                    </div>
                    <div className="bg-background rounded-button p-4">
                      <div className="text-xs text-text-secondary mb-1">Phone</div>
                      <div className="font-semibold">{selectedUser.phone}</div>
                    </div>
                  </div>

                  <div className="bg-background rounded-card p-6 mb-6">
                    <div className="text-lg font-bold mb-4">Wallet</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-text-secondary mb-1">Balance</div>
                        <div className="text-xl font-extrabold text-success">{formatKES(selectedUser.balance)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary mb-1">Escrow</div>
                        <div className="text-xl font-extrabold text-warning">{formatKES(selectedUser.escrowBalance)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary mb-1">Transactions</div>
                        <div className="text-xl font-extrabold">{selectedUser.transactionCount}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      className={`px-5 py-3 rounded-button font-semibold text-white ${
                        selectedUser.status === "ACTIVE" ? "bg-error" : "bg-success"
                      }`}
                      onClick={async () => {
                        const next = selectedUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
                        await adminAPI.updateUserStatus(selectedUser.id, next);
                        setSelectedUser({ ...selectedUser, status: next });
                        await loadUsers();
                      }}
                    >
                      {selectedUser.status === "ACTIVE" ? "Suspend Account" : "Activate Account"}
                    </button>
                    <button className="px-5 py-3 rounded-button font-semibold bg-primary text-white" onClick={() => setActive("transactions")}>
                      View Transactions
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {active === "transactions" || active === "payments" || active === "transfers" ? (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <h2 className="text-3xl font-extrabold">
                {active === "payments" ? "Payments" : active === "transfers" ? "Transfers" : "Transactions"}
              </h2>
              <button className="bg-primary text-white px-5 py-3 rounded-button font-semibold shadow-button">Export CSV</button>
            </div>

            <div className="bg-surface p-6 rounded-card border border-gray-200 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input className="p-3 border-2 border-gray-200 rounded-button" placeholder="Search reference..." value={txnQuery} onChange={(e) => setTxnQuery(e.target.value)} />
                <select className="p-3 border-2 border-gray-200 rounded-button" value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                  <option value="">All Types</option>
                  <option value="DEPOSIT">DEPOSIT</option>
                  <option value="WITHDRAWAL">WITHDRAWAL</option>
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="ESCROW_LOCK">ESCROW_LOCK</option>
                  <option value="ESCROW_RELEASE">ESCROW_RELEASE</option>
                </select>
                <select className="p-3 border-2 border-gray-200 rounded-button" value={txnStatus} onChange={(e) => setTxnStatus(e.target.value)}>
                  <option value="">All Status</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="PENDING">PENDING</option>
                  <option value="FAILED">FAILED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
                <button className="bg-primary text-white rounded-button font-semibold" onClick={() => void loadTransactions()}>
                  Apply
                </button>
              </div>
            </div>

            <div className="bg-surface rounded-card border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-background text-text-secondary">
                    <tr>
                      {["Reference", "From", "To", "Amount", "Fee", "Type", "Method", "Status", "Timestamp"].map((h) => (
                        <th key={h} className="text-left font-semibold px-4 py-3 border-b border-gray-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map((t) => (
                      <tr key={t.id} className="border-b border-gray-100 hover:bg-background">
                        <td className="px-4 py-3 font-mono text-xs">{t.reference}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{t.from}</div>
                          {t.fromPhone ? <div className="text-xs text-text-secondary">{t.fromPhone}</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{t.to}</div>
                          {t.toPhone ? <div className="text-xs text-text-secondary">{t.toPhone}</div> : null}
                        </td>
                        <td className="px-4 py-3 font-extrabold text-primary">{formatKES(t.amount)}</td>
                        <td className="px-4 py-3 text-text-secondary">{t.fee ? formatKES(t.fee) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-light text-primary">{t.type}</span>
                        </td>
                        <td className="px-4 py-3 text-xs">{t.method || "—"}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={t.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{new Date(t.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {active === "wallets" ? (
          <div>
            <h2 className="text-3xl font-extrabold mb-6">Wallet Management</h2>
            <div className="bg-surface rounded-card border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-background text-text-secondary">
                    <tr>
                      {["User", "Role", "Balance", "Pending", "Escrow", "Currency", "Last Activity"].map((h) => (
                        <th key={h} className="text-left font-semibold px-4 py-3 border-b border-gray-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wallets.map((w) => (
                      <tr key={w.userId} className="border-b border-gray-100 hover:bg-background">
                        <td className="px-4 py-3 font-semibold">{w.userName}</td>
                        <td className="px-4 py-3">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-light text-primary">{w.role}</span>
                        </td>
                        <td className="px-4 py-3 font-extrabold text-success">{formatKES(w.balance)}</td>
                        <td className="px-4 py-3 font-semibold text-text-secondary">{formatKES(w.pendingBalance)}</td>
                        <td className="px-4 py-3 font-extrabold text-warning">{formatKES(w.escrowBalance)}</td>
                        <td className="px-4 py-3 text-xs">{w.currency}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{new Date(w.lastTransaction).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {active === "kyc" ? (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <h2 className="text-3xl font-extrabold">KYC Submissions</h2>
              <select className="p-3 border-2 border-gray-200 rounded-button" value={kycStatus} onChange={(e) => setKycStatus(e.target.value)}>
                <option value="">All</option>
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Verified</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <button className="mb-4 bg-primary text-white px-4 py-2 rounded-button font-semibold" onClick={() => void loadKyc()}>
              Refresh
            </button>

            <div className="flex flex-col gap-4">
              {kyc.map((k) => (
                <div key={k.id} className="bg-surface p-6 rounded-card border border-gray-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="text-lg font-extrabold">{k.user?.name}</div>
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
                          <div className="font-semibold">{k.idType}</div>
                          <div>{k.idNumber}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-secondary">DOB</div>
                          <div className="font-semibold">{k.dateOfBirth ? new Date(k.dateOfBirth).toLocaleDateString() : "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-text-secondary">Address</div>
                          <div className="font-semibold">{k.address || "—"}</div>
                        </div>
                      </div>

                      <div className="text-xs text-text-secondary">
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
                            await loadKyc();
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
                            await loadKyc();
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
          </div>
        ) : null}

        {active === "disputes" ? (
          <div>
            <h2 className="text-3xl font-extrabold mb-6">Disputes</h2>
            <div className="flex flex-col gap-4">
              {disputes.map((d) => (
                <div key={d.id} className="bg-surface p-6 rounded-card border border-gray-200">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-lg font-extrabold">{d.project?.title || "Project"}</div>
                        <StatusPill status={d.status} />
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${d.priority === "HIGH" ? "bg-red-50 text-red-700 border-red-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                          {d.priority} PRIORITY
                        </span>
                      </div>
                      <div className="text-xs text-text-secondary">Dispute ID: {d.id}</div>
                    </div>
                    <div className="px-4 py-2 rounded-button bg-orange-50 border border-orange-200 text-orange-700 font-extrabold">
                      {formatKES(Number(d.project?.escrowBalance || 0))} escrow
                    </div>
                  </div>

                  <div className="bg-background rounded-button p-4 grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-text-secondary mb-1">Reporter</div>
                      <div className="font-semibold">{d.reporter?.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary mb-1">Status</div>
                      <div className="font-semibold">{d.status}</div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-sm font-semibold mb-2">Issue</div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-button text-red-700 font-semibold mb-2">{d.issue}</div>
                    <div className="text-sm">{d.evidence ? JSON.stringify(d.evidence) : ""}</div>
                  </div>

                  <div className="text-xs text-text-secondary">Created: {new Date(d.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}


