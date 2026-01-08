type Props = {
  status: string;
};

export function StatusPill({ status }: Props) {
  const s = String(status || "").toUpperCase();

  const config =
    s === "SUCCESS"
      ? { cls: "bg-green-50 text-green-700 border-green-200", label: "Success" }
      : s === "FAILED" || s === "CANCELLED"
        ? { cls: "bg-red-50 text-red-700 border-red-200", label: s === "CANCELLED" ? "Cancelled" : "Failed" }
        : { cls: "bg-orange-50 text-orange-700 border-orange-200", label: "Pending" };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${config.cls}`}>
      {config.label}
    </span>
  );
}




