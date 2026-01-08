import { Link } from "react-router-dom";

export function LegalPage({ title }: { title: string }) {
  return (
    <div className="bg-surface border border-gray-200 rounded-card p-6 md:p-10">
      <div className="mb-6">
        <Link to="/" className="text-primary font-semibold hover:underline">
          ← Back to Bridge
        </Link>
      </div>
      <h1 className="text-3xl font-extrabold text-text mb-3">{title}</h1>
      <p className="text-text-secondary">
        This page is a placeholder for now. Add your official {title.toLowerCase()} content before going live.
      </p>
      <div className="mt-6 text-sm text-text-secondary">
        Tip: Keep it simple, clear, and locally relevant (payments, data handling, refunds, chargebacks, and dispute resolution).
      </div>
    </div>
  );
}


