"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import Input from "./Input";
import Label from "./Label";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

// Composed label+input+error/hint, with the id/htmlFor association wired up
// automatically (via useId when no id is passed) so every form field gets
// proper <label> association without repeating that boilerplate per page.
export default function TextField({
  label,
  error,
  hint,
  id,
  containerClassName = "",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={containerClassName}>
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        error={!!error}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-600 dark:text-cp-error-text-dark">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{hint}</p>
      )}
    </div>
  );
}
