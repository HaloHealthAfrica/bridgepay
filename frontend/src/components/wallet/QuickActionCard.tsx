import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
};

export function QuickActionCard({ icon: Icon, label, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 bg-surface rounded-card p-5 text-center border border-gray-200 hover:-translate-y-1 hover:shadow-card transition"
    >
      <div className="inline-flex items-center justify-center rounded-button bg-primary-light p-4 mb-3">
        <Icon size={24} className="text-primary" />
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </button>
  );
}




