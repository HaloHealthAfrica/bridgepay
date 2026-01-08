type Props = {
  balance: number;
  pending: number;
  escrow: number;
};

export function WalletHeroCard({ balance, pending, escrow }: Props) {
  return (
    <div className="rounded-card p-6 text-white mb-6 shadow-button border border-primary/20 bg-gradient-to-br from-primary to-primary-dark">
      <div className="text-sm opacity-90 mb-2">Total Balance</div>
      <div className="text-4xl font-extrabold mb-4">KES {balance.toLocaleString()}</div>

      <div className="flex gap-6 text-sm">
        <div>
          <div className="opacity-80">Pending</div>
          <div className="font-semibold">KES {pending.toLocaleString()}</div>
        </div>
        <div>
          <div className="opacity-80">In Escrow</div>
          <div className="font-semibold">KES {escrow.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}




