interface SectionHeadingProps {
  title: string;
  description?: string;
}

export default function SectionHeading({ title, description }: SectionHeadingProps) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
}
