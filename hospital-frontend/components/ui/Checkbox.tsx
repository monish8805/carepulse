"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export default function Checkbox({ label, id, className = "", ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-cp-input-border text-cp-primary focus:ring-2 focus:ring-cp-focus-ring focus:ring-offset-1 dark:focus:ring-cp-focus-ring-dark dark:border-cp-input-border-dark dark:bg-cp-input-dark dark:text-cp-primary-dark"
        {...props}
      />
      <label htmlFor={inputId} className="text-sm text-cp-text dark:text-cp-text-dark">
        {label}
      </label>
    </div>
  );
}
