import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

// Bare styled input — used directly where a visible <label> isn't the right
// fit (e.g. a search box with its own placeholder), otherwise composed by
// TextField below.
export default function Input({ error = false, className = "", ...props }: InputProps) {
  return (
    <input
      className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800 ${
        error
          ? "border-red-400 focus:border-red-600 focus:ring-red-600"
          : "border-slate-300 dark:border-slate-700"
      } ${className}`}
      {...props}
    />
  );
}
