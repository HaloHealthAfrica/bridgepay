export function ProgressBar({ progress, height = 8 }: { progress: number; height?: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="w-full bg-gray-200 rounded-full overflow-hidden" style={{ height }}>
      <div className="bg-primary rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, height }} />
    </div>
  );
}




