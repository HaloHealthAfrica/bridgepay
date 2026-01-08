type Props = {
  balance: number;
  pending: number;
  escrow: number;
};

export const WalletCard = ({ balance, pending, escrow }: Props) => {
  return (
    <div className="rounded-card bg-surface shadow-card border border-gray-100 p-6">
      <div className="text-text-secondary text-sm">Available Balance</div>
      <div className="text-4xl font-extrabold mt-2">KES {balance.toLocaleString()}</div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="rounded-button bg-primary-light p-4 border border-primary/10">
          <div className="text-xs text-text-secondary">Pending</div>
          <div className="text-lg font-bold mt-1">KES {pending.toLocaleString()}</div>
        </div>
        <div className="rounded-button bg-primary-light p-4 border border-primary/10">
          <div className="text-xs text-text-secondary">In Escrow</div>
          <div className="text-lg font-bold mt-1">KES {escrow.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};




