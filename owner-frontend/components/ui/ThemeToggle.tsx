"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "cp-theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode, blocked) — the toggle still
    // works for the current page load via the DOM class, it just won't be
    // remembered on the next visit.
  }
}

// A manual override on top of the system preference. The inline no-flash
// script in app/layout.tsx already applies the right class to <html> before
// paint (a stored override if one exists, else `prefers-color-scheme`) — this
// component only needs to read that resolved state on mount to sync React,
// then flip both the class and the stored override on click.
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a client-only value (the class the no-flash script already set) on mount, not a derived/cascading update
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next: "light" | "dark" = isDark ? "light" : "dark";
    applyTheme(next);
    setIsDark(next === "dark");
  }

  // Render a same-sized placeholder until mounted — the real icon depends on
  // the DOM class the no-flash script set outside of React, which isn't
  // knowable during server rendering without guessing wrong half the time.
  if (!mounted) {
    return <span className="inline-block h-8 w-8" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      )}
    </button>
  );
}
