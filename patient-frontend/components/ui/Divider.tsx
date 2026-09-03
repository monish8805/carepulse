export default function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-cp-border dark:border-cp-border-dark ${className}`} />;
}
