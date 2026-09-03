export default function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-cp-input-border border-t-cp-primary dark:border-cp-border-dark dark:border-t-cp-primary-dark"
      />
      <span role="status">{label}</span>
    </div>
  );
}
