import type { LabelHTMLAttributes } from "react";

export default function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1 block text-sm font-medium text-cp-text dark:text-cp-text-dark ${className}`}
      {...props}
    />
  );
}
