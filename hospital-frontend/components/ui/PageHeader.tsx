interface PageHeaderProps {
  title: string;
  description?: string;
}

export default function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-semibold tracking-tight text-cp-text dark:text-cp-text-dark">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{description}</p>
      )}
    </div>
  );
}
