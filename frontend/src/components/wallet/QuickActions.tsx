import { Link } from "react-router-dom";

export const QuickActions = () => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Link
        to="/wallet/add"
        className="rounded-card bg-surface border border-gray-200 p-5 hover:border-primary hover:text-primary transition"
      >
        <div className="font-bold">Add Money</div>
        <div className="text-sm text-text-secondary mt-1">M-Pesa, Card, or Paybill</div>
      </Link>

      <Link
        to="/wallet/send"
        className="rounded-card bg-surface border border-gray-200 p-5 hover:border-primary hover:text-primary transition"
      >
        <div className="font-bold">Send Money</div>
        <div className="text-sm text-text-secondary mt-1">Wallet P2P or M-Pesa</div>
      </Link>

      <Link
        to="/wallet/add?method=paybill"
        className="rounded-card bg-surface border border-gray-200 p-5 hover:border-primary hover:text-primary transition"
      >
        <div className="font-bold">Paybill Deposit</div>
        <div className="text-sm text-text-secondary mt-1">Manual Paybill (C2B)</div>
      </Link>

      <Link
        to="/settings/withdraw?method=bank"
        className="rounded-card bg-surface border border-gray-200 p-5 hover:border-primary hover:text-primary transition"
      >
        <div className="font-bold">Withdraw</div>
        <div className="text-sm text-text-secondary mt-1">M-Pesa or Bank (A2P)</div>
      </Link>
    </div>
  );
};




