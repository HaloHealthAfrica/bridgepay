import { useNavigate } from "react-router-dom";

export function Placeholder({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto">
      <button type="button" onClick={() => navigate("/settings")} className="text-primary font-semibold mb-4 hover:underline">
        ← Back to Settings
      </button>
      <div className="bg-surface rounded-card p-6 border border-gray-200">
        <div className="text-2xl font-extrabold mb-2">{title}</div>
        <div className="text-text-secondary">UI is in place; backend wiring can be added next.</div>
      </div>
    </div>
  );
}




