import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export default function Select({ error = false, className = "", children, ...props }: SelectProps) {
  return (
    <select
      className={`block w-full rounded-lg border bg-cp-input px-3 py-2 text-sm text-cp-text focus:border-cp-focus-border focus:ring focus:ring-cp-focus-ring focus:outline-none dark:focus:border-cp-focus-border-dark dark:focus:ring-cp-focus-ring-dark disabled:cursor-not-allowed disabled:bg-cp-workspace disabled:text-cp-text-subtle dark:bg-cp-input-dark dark:text-cp-text-dark dark:disabled:bg-cp-workspace-dark ${
        error
          ? "border-red-400 focus:border-red-600 focus:ring-red-600"
          : "border-cp-input-border dark:border-cp-input-border-dark"
      } ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
