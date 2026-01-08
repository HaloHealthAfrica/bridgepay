import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { StatusPill } from "../ui/StatusPill";

export type UITransaction = {
  id: string;
  direction: "send" | "receive";
  title: string;
  amount: number;
  dateLabel: string;
  status: string;
};

export function TransactionRow({ transaction, onClick }: { transaction: UITransaction; onClick: () => void }) {
  const isPositive = transaction.direction === "receive";
  const Icon = isPositive ? ArrowDownLeft : ArrowUpRight;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center p-4 bg-surface rounded-button mb-2 border border-gray-200 hover:scale-[1.01] transition text-left"
    >
      <div className={`rounded-button p-3 mr-3 ${isPositive ? "bg-green-50" : "bg-red-50"}`}>
        <Icon size={20} className={isPositive ? "text-success" : "text-error"} />
      </div>

      <div className="flex-1">
        <div className="font-semibold mb-1">{transaction.title}</div>
        <div className="text-xs text-text-secondary">{transaction.dateLabel}</div>
      </div>

      <div className="text-right">
        <div className={`font-bold text-base ${isPositive ? "text-success" : "text-text"}`}>
          {isPositive ? "+" : "-"} KES {transaction.amount.toLocaleString()}
        </div>
        <StatusPill status={transaction.status} />
      </div>
    </button>
  );
}




