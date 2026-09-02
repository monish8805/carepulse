interface StepperProps {
  labels: string[];
  currentIndex: number; // 0-based
}

// A numbered progress indicator for short, linear multi-step flows (e.g.
// register). Purely presentational — the owning page decides what "step"
// means and how to move between them; this just renders where you are.
export default function Stepper({ labels, currentIndex }: StepperProps) {
  return (
    <div className="flex items-start">
      {labels.map((label, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <div key={label} className={`flex items-center ${index < labels.length - 1 ? "flex-1" : ""}`}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  isComplete || isCurrent
                    ? "bg-blue-600 text-white"
                    : "border border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                }`}
              >
                {isComplete ? "✓" : index + 1}
              </div>
              <span
                className={`text-xs font-medium tracking-wide uppercase ${
                  isCurrent
                    ? "text-slate-900 dark:text-slate-100"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {label}
              </span>
            </div>
            {index < labels.length - 1 && (
              <div
                className={`mx-2 mt-4 h-px flex-1 ${
                  isComplete ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
