import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

type ToastTone = "success" | "error";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 4000;

// Short-lived confirmations for list actions ("Disabled City Hospital.") —
// form-level and modal errors stay as inline Alerts next to the thing that
// failed. Mounted once in __root.tsx, so every page (including /login) can
// call useToast().
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++nextId.current;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (message) => show("success", message), error: (message) => show("error", message) }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Top-right, under the 56px header — clear of the dev-only devtools
          button in the bottom-right corner. */}
      <div className="pointer-events-none fixed top-16 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = toast.tone === "error" ? AlertCircle : CheckCircle2;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-cp-border bg-cp-card px-4 py-3 text-sm text-cp-text shadow-lg dark:border-cp-border-dark dark:bg-cp-card-dark dark:text-cp-text-dark"
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  toast.tone === "error"
                    ? "text-red-600 dark:text-cp-error-text-dark"
                    : "text-cp-success-text dark:text-cp-success-text-dark"
                }`}
                aria-hidden="true"
                strokeWidth={2}
              />
              <p className="flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded text-xs font-medium text-cp-text-muted hover:text-cp-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-cp-primary dark:text-cp-text-muted-dark dark:hover:text-cp-text-dark"
              >
                Dismiss
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside ToastProvider (mounted in __root.tsx).");
  return toast;
}
