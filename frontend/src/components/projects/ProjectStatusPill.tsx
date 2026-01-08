type Props = {
  status: string;
};

// Backend ProjectStatus: DRAFT | OPEN | ASSIGNED | ACTIVE | COMPLETED | DISPUTED | CANCELLED
export function ProjectStatusPill({ status }: Props) {
  const s = String(status || "").toUpperCase();

  const config =
    s === "ACTIVE"
      ? { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Active" }
      : s === "ASSIGNED"
        ? { cls: "bg-orange-50 text-orange-700 border-orange-200", label: "Funding" }
        : s === "OPEN"
          ? { cls: "bg-orange-50 text-orange-700 border-orange-200", label: "Open" }
          : s === "COMPLETED"
            ? { cls: "bg-green-50 text-green-700 border-green-200", label: "Completed" }
            : s === "DISPUTED"
              ? { cls: "bg-red-50 text-red-700 border-red-200", label: "Disputed" }
              : s === "CANCELLED"
                ? { cls: "bg-gray-50 text-gray-700 border-gray-200", label: "Cancelled" }
                : { cls: "bg-gray-50 text-gray-700 border-gray-200", label: "Draft" };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${config.cls}`}>
      {config.label}
    </span>
  );
}




