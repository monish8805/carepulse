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
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-900"
        {...props}
      />
      <label htmlFor={inputId} className="text-sm text-slate-700 dark:text-slate-300">
        {label}
      </label>
    </div>
  );
}
