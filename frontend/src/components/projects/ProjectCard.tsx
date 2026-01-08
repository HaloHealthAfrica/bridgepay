import { ProjectStatusPill } from "./ProjectStatusPill";
import { ProgressBar } from "./ProgressBar";

type Props = {
  project: any;
  onClick: () => void;
};

export function ProjectCard({ project, onClick }: Props) {
  const budget = Number(project.budget || 0);
  const escrow = Number(project.escrowBalance || 0);
  const progress = budget > 0 ? (escrow / budget) * 100 : 0;

  const milestones = project.milestones || [];
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m: any) => m.status === "APPROVED").length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-surface rounded-card p-6 mb-4 border border-gray-200 hover:-translate-y-0.5 hover:shadow-card transition"
    >
      <div className="flex justify-between items-start gap-3 mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-extrabold mb-2">{project.title}</h3>
          <p className="text-sm text-text-secondary">{project.description}</p>
        </div>
        <ProjectStatusPill status={project.status} />
      </div>

      <div className="mb-4">
        <div className="flex justify-between mb-2 text-sm">
          <span className="text-text-secondary">Escrow Progress</span>
          <span className="font-semibold">
            KES {escrow.toLocaleString()} / {budget.toLocaleString()}
          </span>
        </div>
        <ProgressBar progress={progress} />
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-text-secondary mb-1">Milestones</div>
          <div className="font-semibold">
            {completedMilestones}/{totalMilestones}
          </div>
        </div>
        <div>
          <div className="text-text-secondary mb-1">Escrow</div>
          <div className="font-semibold text-primary">KES {escrow.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-text-secondary mb-1">Status</div>
          <div className="font-semibold">{project.status}</div>
        </div>
      </div>
    </button>
  );
}




