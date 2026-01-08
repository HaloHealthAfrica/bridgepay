export function Modal({
  open,
  title,
  onClose,
  children,
  maxWidthClass = "max-w-xl",
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-surface rounded-card w-full ${maxWidthClass} p-8 shadow-card`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="text-xl font-extrabold">{title}</div>
          <button
            type="button"
            className="px-3 py-2 rounded-button bg-background hover:bg-gray-200 transition font-semibold"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}




