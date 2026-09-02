export default function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-slate-200 dark:border-slate-800 ${className}`} />;
}
