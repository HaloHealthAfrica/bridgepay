import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { projectAPI } from "../../services/api";
import { PrimaryButton, SecondaryButton } from "../../components/ui/Buttons";

type MilestoneDraft = {
  title: string;
  description: string;
  amount: string;
  dueDate?: string;
};

export function CreateProject() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Web Development");
  const [timeline, setTimeline] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState<string>("");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { title: "Milestone 1", description: "Describe deliverable", amount: "0" },
  ]);
  const [loading, setLoading] = useState(false);

  const milestonesTotal = useMemo(
    () => milestones.reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [milestones]
  );

  const budgetNum = Number(budget || 0);
  const canSubmit = title && description && budgetNum > 0 && milestones.length > 0 && Math.abs(milestonesTotal - budgetNum) < 0.01;

  const addMilestone = () => setMilestones((prev) => [...prev, { title: `Milestone ${prev.length + 1}`, description: "", amount: "0" }]);

  const updateMilestone = (idx: number, patch: Partial<MilestoneDraft>) =>
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  const removeMilestone = (idx: number) => setMilestones((prev) => prev.filter((_, i) => i !== idx));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      return alert("Please fill all fields and ensure milestones total equals budget.");
    }

    setLoading(true);
    try {
      const res = await projectAPI.createProject({
        title,
        description,
        category: `${category}${timeline ? ` • ${timeline}` : ""}`,
        budget: budgetNum,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        milestones: milestones.map((m) => ({
          title: m.title,
          description: m.description,
          amount: Number(m.amount),
          dueDate: m.dueDate ? new Date(m.dueDate).toISOString() : undefined,
        })),
      });

      const projectId = res.data.data.project.id;
      alert("Project created. Add applicants, assign implementer, then fund.");
      navigate(`/projects/${projectId}`);
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button type="button" onClick={() => navigate("/projects")} className="text-primary font-semibold mb-4 hover:underline">
        ← Back to Projects
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create New Project</h1>
        <p className="text-text-secondary">Set up your project with milestones and escrow</p>
      </div>

      <form onSubmit={onSubmit} className="bg-surface rounded-card p-8 border border-gray-200">
        <div className="mb-6">
          <label className="block mb-2 font-semibold">Project Title</label>
          <input
            className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. E-Commerce Website Development"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block mb-2 font-semibold">Description</label>
          <textarea
            className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe what you want to build..."
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block mb-2 font-semibold">Category</label>
            <select
              className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>Web Development</option>
              <option>Mobile App</option>
              <option>Enterprise Software</option>
              <option>Design</option>
              <option>Marketing</option>
            </select>
          </div>

          <div>
            <label className="block mb-2 font-semibold">Timeline</label>
            <input
              className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              placeholder="e.g. 12 weeks"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block mb-2 font-semibold">Total Budget (KES)</label>
            <input
              type="number"
              className="w-full p-4 text-xl font-bold border-2 border-gray-200 rounded-button bg-surface"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="500000"
              required
            />
            <div className={`text-xs mt-2 ${Math.abs(milestonesTotal - budgetNum) < 0.01 ? "text-success" : "text-warning"}`}>
              Milestones total: KES {milestonesTotal.toLocaleString()}
            </div>
          </div>

          <div>
            <label className="block mb-2 font-semibold">Deadline (optional)</label>
            <input
              type="date"
              className="w-full p-4 border-2 border-gray-200 rounded-button bg-surface"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-primary-light rounded-card p-4 mb-6 border border-primary/10">
          <div className="flex gap-3">
            <Shield className="text-primary" />
            <div>
              <div className="font-semibold mb-1">Escrow Protection</div>
              <div className="text-sm text-text-secondary">
                Funds are held securely in escrow and released only when milestones are approved.
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold">Milestones</div>
            <button type="button" onClick={addMilestone} className="text-primary font-semibold hover:underline">
              + Add milestone
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {milestones.map((m, idx) => (
              <div key={idx} className="border border-gray-200 rounded-card p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Title</label>
                    <input
                      className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface"
                      value={m.title}
                      onChange={(e) => updateMilestone(idx, { title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Amount (KES)</label>
                    <input
                      type="number"
                      className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface"
                      value={m.amount}
                      onChange={(e) => updateMilestone(idx, { amount: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm font-semibold mb-1">Description</label>
                  <input
                    className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface"
                    value={m.description}
                    onChange={(e) => updateMilestone(idx, { description: e.target.value })}
                    required
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold mb-1">Due date (optional)</label>
                    <input
                      type="date"
                      className="w-full p-3 border-2 border-gray-200 rounded-button bg-surface"
                      value={m.dueDate || ""}
                      onChange={(e) => updateMilestone(idx, { dueDate: e.target.value })}
                    />
                  </div>
                  {milestones.length > 1 ? (
                    <button type="button" className="text-error font-semibold mt-6" onClick={() => removeMilestone(idx)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <SecondaryButton fullWidth onClick={() => navigate("/projects")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton fullWidth type="submit" disabled={loading || !canSubmit}>
            {loading ? "Creating..." : "Create Project"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}




