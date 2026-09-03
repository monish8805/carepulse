interface SectionHeadingProps {
  title: string;
  description?: string;
}

export default function SectionHeading({ title, description }: SectionHeadingProps) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-cp-text dark:text-cp-text-dark">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{description}</p>
      )}
    </div>
  );
}
