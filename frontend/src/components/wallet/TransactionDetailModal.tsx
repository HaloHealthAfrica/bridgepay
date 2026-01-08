import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { StatusPill } from "../ui/StatusPill";
import { PrimaryButton, SecondaryButton } from "../ui/Buttons";
import type { UITransaction } from "./TransactionRow";

type Props = {
  transaction: UITransaction & { backendId?: string };
  onClose: () => void;
  onReceipt?: () => Promise<void> | void;
};

export function TransactionDetailModal({ transaction, onClose, onReceipt }: Props) {
  const isPositive = transaction.direction === "receive";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-card p-8 w-full max-w-md shadow-card"
      >
        <div className="text-center mb-6">
          <div
            className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
              isPositive ? "bg-green-50" : "bg-red-50"
            }`}
          >
            {isPositive ? <ArrowDownLeft size={40} className="text-success" /> : <ArrowUpRight size={40} className="text-error" />}
          </div>
          <div className="text-3xl font-extrabold mb-2">
            {isPositive ? "+" : "-"} KES {transaction.amount.toLocaleString()}
          </div>
          <StatusPill status={transaction.status} />
        </div>

        <div className="bg-background rounded-button p-4 mb-6">
          <div className="flex justify-between mb-3">
            <span className="text-text-secondary">To/From</span>
            <span className="font-semibold">{transaction.title}</span>
          </div>
          <div className="flex justify-between mb-3">
            <span className="text-text-secondary">Date</span>
            <span className="font-semibold">{transaction.dateLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Fee</span>
            <span className="font-semibold">KES 0</span>
          </div>
        </div>

        <div className="flex gap-3">
          <SecondaryButton fullWidth onClick={onClose}>
            Close
          </SecondaryButton>
          <PrimaryButton
            fullWidth
            onClick={() => {
              void onReceipt?.();
            }}
          >
            Get Receipt
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}




