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
      className={`block w-full rounded-lg border bg-cp-input px-3 py-2 text-sm text-cp-text placeholder:text-cp-text-subtle focus:border-cp-focus-border focus:ring focus:ring-cp-focus-ring focus:outline-none disabled:cursor-not-allowed disabled:bg-cp-workspace disabled:text-cp-text-subtle dark:bg-cp-input-dark dark:text-cp-text-dark dark:placeholder:text-cp-text-subtle-dark dark:disabled:bg-cp-workspace-dark ${
        error
          ? "border-red-400 focus:border-red-600 focus:ring-red-600"
          : "border-cp-input-border dark:border-cp-input-border-dark"
      } ${className}`}
      {...props}
    />
  );
}
