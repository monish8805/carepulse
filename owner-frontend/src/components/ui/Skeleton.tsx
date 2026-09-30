// A pulsing placeholder block — sized by the caller via className.
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-cp-border dark:bg-cp-border-dark ${className}`} />;
}

// Placeholder rows shaped like the app's list rows (name + meta line on the
// left, an action button on the right), shown inside a Card while its list
// loads — so the card keeps its size instead of jumping when data arrives.
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status">
      <span className="sr-only">Loading...</span>
      <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-20" />
          </li>
        ))}
      </ul>
    </div>
  );
}
