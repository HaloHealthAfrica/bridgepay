import { CheckCircle, Clock, FileText, Target, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { StatusPill } from "../ui/StatusPill";

type Props = {
  milestone: any;
  showActions?: boolean;
  onApprove?: (milestone: any) => void;
  onReject?: (milestone: any) => void;
  onViewEvidence?: (milestone: any) => void;
  extraActions?: React.ReactNode;
};

function mapMilestoneStatusToUi(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED") return { ui: "SUCCESS", icon: CheckCircle, bg: "bg-green-50", color: "text-success" };
  if (s === "REJECTED") return { ui: "FAILED", icon: XCircle, bg: "bg-red-50", color: "text-error" };
  if (s === "SUBMITTED" || s === "IN_REVIEW") return { ui: "PENDING", icon: Clock, bg: "bg-orange-50", color: "text-warning" };
  if (s === "IN_PROGRESS") return { ui: "PENDING", icon: Clock, bg: "bg-orange-50", color: "text-warning" };
  return { ui: "PENDING", icon: Target, bg: "bg-primary-light", color: "text-text-secondary" };
}

export function MilestoneCard({ milestone, showActions, onApprove, onReject, onViewEvidence, extraActions }: Props) {
  const mapped = mapMilestoneStatusToUi(milestone.status);
  const Icon = mapped.icon;

  const hasEvidence = !!milestone.evidence;

  return (
    <div className="bg-surface rounded-button p-5 mb-3 border border-gray-200">
      <div className="flex gap-4">
        <div className={`w-12 h-12 rounded-button flex items-center justify-center flex-shrink-0 ${mapped.bg}`}>
          <Icon size={24} className={mapped.color} />
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h4 className="text-base font-extrabold mb-1">{milestone.title}</h4>
              <p className="text-sm text-text-secondary">{milestone.description}</p>
            </div>
            <StatusPill status={mapped.ui} />
          </div>

          <div className="flex flex-wrap gap-6 text-xs mb-3">
            <div>
              <span className="text-text-secondary">Amount: </span>
              <span className="font-semibold">KES {Number(milestone.amount).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-text-secondary">Due: </span>
              <span className="font-semibold">
                {milestone.dueDate ? new Date(milestone.dueDate).toLocaleDateString() : "—"}
              </span>
            </div>
          </div>

          {hasEvidence ? (
            <div className="bg-primary-light border border-primary/10 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={16} className="text-primary" />
                <span className="font-semibold text-sm">Evidence Submitted</span>
              </div>
              <div className="text-xs text-text-secondary">
                {typeof milestone.evidence === "string" ? milestone.evidence : "Evidence attached"}
              </div>
              <button
                type="button"
                onClick={() => onViewEvidence?.(milestone)}
                className="text-primary text-xs font-semibold mt-2 hover:underline"
              >
                View Evidence →
              </button>
            </div>
          ) : null}

          {showActions && (milestone.status === "SUBMITTED" || milestone.status === "IN_REVIEW") ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onApprove?.(milestone)}
                className="flex-1 py-2 rounded-lg bg-success text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <ThumbsUp size={16} />
                Approve
              </button>
              <button
                type="button"
                onClick={() => onReject?.(milestone)}
                className="flex-1 py-2 rounded-lg bg-error text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <ThumbsDown size={16} />
                Reject
              </button>
            </div>
          ) : null}

          {extraActions ? <div className="mt-2">{extraActions}</div> : null}
        </div>
      </div>
    </div>
  );
}




