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
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  isComplete || isCurrent
                    ? "bg-cp-primary text-white dark:bg-cp-primary-dark"
                    : "border border-cp-input-border bg-cp-input text-cp-text-muted dark:border-cp-input-border-dark dark:bg-cp-input-dark dark:text-cp-text-muted-dark"
                }`}
              >
                {isComplete ? "✓" : index + 1}
              </div>
              <span
                className={`font-mono text-xs tracking-wide uppercase ${
                  isCurrent
                    ? "font-semibold text-cp-primary dark:text-cp-primary-dark"
                    : "font-medium text-cp-text-muted dark:text-cp-text-muted-dark"
                }`}
              >
                {label}
              </span>
            </div>
            {index < labels.length - 1 && (
              <div
                className={`mx-2 mt-3.5 h-0.5 flex-1 ${
                  isComplete ? "bg-cp-primary dark:bg-cp-primary-dark" : "bg-cp-border dark:bg-cp-border-dark"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
