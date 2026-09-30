import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-cp-border bg-cp-quiet-bg px-6 py-10 text-center dark:border-cp-border-dark dark:bg-cp-quiet-bg-dark">
      <p className="text-sm font-medium text-cp-text dark:text-cp-text-dark">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
