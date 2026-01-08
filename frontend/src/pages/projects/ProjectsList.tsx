import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, CheckCircle, Lock, Plus } from "lucide-react";
import { projectAPI } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import { PrimaryButton } from "../../components/ui/Buttons";
import { ProjectCard } from "../../components/projects/ProjectCard";

type RoleMode = "project-owner" | "implementer" | "verifier" | "funder";

function roleModeToQuery(mode: RoleMode): string | undefined {
  if (mode === "project-owner") return "owner";
  if (mode === "implementer") return "implementer";
  if (mode === "verifier") return "verifier";
  if (mode === "funder") return "browse";
  return undefined;
}

export function ProjectsList() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const defaultMode: RoleMode =
    user?.role === "IMPLEMENTER"
      ? "implementer"
      : user?.role === "PROJECT_VERIFIER"
        ? "verifier"
        : "project-owner";

  const [mode, setMode] = useState<RoleMode>(defaultMode);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const role = roleModeToQuery(mode);
        const res = await projectAPI.getProjects({ page: 1, limit: 50, role });
        setProjects(res.data.data.projects || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [mode]);

  const activeCount = useMemo(() => projects.filter((p) => p.status === "ACTIVE").length, [projects]);
  const escrowTotal = useMemo(() => projects.reduce((sum, p) => sum + Number(p.escrowBalance || 0), 0), [projects]);
  const milestonesDone = useMemo(() => {
    const all = projects.flatMap((p) => p.milestones || []);
    const done = all.filter((m: any) => m.status === "APPROVED").length;
    return { done, total: all.length };
  }, [projects]);

  const heading =
    mode === "verifier" ? "Projects to Verify" : mode === "funder" ? "Investment Opportunities" : "My Projects";

  const sub =
    mode === "verifier"
      ? "Review and approve project milestones"
      : mode === "funder"
        ? "Fund projects and track progress"
        : "Create, manage and track your projects";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">{heading}</h1>
          <p className="text-text-secondary">{sub}</p>
        </div>

        <div className="flex gap-3 items-center">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as RoleMode)}
            className="px-3 py-2 rounded-lg border-2 border-primary text-primary font-semibold bg-surface"
          >
            <option value="project-owner">Project Owner</option>
            <option value="implementer">Implementer</option>
            <option value="verifier">Verifier</option>
            <option value="funder">Funder</option>
          </select>

          {mode === "project-owner" ? (
            <PrimaryButton icon={Plus} onClick={() => navigate("/projects/new")}>
              Create Project
            </PrimaryButton>
          ) : null}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-card p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-primary-light rounded-lg p-2">
              <Briefcase size={20} className="text-primary" />
            </div>
            <span className="text-sm text-text-secondary">Active Projects</span>
          </div>
          <div className="text-3xl font-extrabold">{activeCount}</div>
        </div>

        <div className="bg-surface rounded-card p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-orange-50 rounded-lg p-2">
              <Lock size={20} className="text-warning" />
            </div>
            <span className="text-sm text-text-secondary">In Escrow</span>
          </div>
          <div className="text-3xl font-extrabold text-primary">KES {escrowTotal.toLocaleString()}</div>
        </div>

        <div className="bg-surface rounded-card p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-50 rounded-lg p-2">
              <CheckCircle size={20} className="text-success" />
            </div>
            <span className="text-sm text-text-secondary">Completed Milestones</span>
          </div>
          <div className="text-3xl font-extrabold">
            {milestonesDone.done}/{milestonesDone.total}
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div>Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-text-secondary">No projects found.</div>
      ) : (
        projects.map((p) => <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />)
      )}
    </div>
  );
}




