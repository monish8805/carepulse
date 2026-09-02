import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export default function Select({ error = false, className = "", children, ...props }: SelectProps) {
  return (
    <select
      className={`block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800 ${
        error ? "border-red-400 focus:border-red-600 focus:ring-red-600" : "border-slate-300 dark:border-slate-700"
      } ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
