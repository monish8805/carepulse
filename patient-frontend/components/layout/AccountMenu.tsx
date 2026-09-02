"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

export interface AccountMenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  // Small muted trailing text, e.g. "Coming soon" for a not-yet-built item.
  hint?: string;
  // Decorative only — the label text is always present regardless.
  icon?: LucideIcon;
  // Highlights the item with the active/teal tint when it represents the
  // page currently being viewed — the caller decides this (it already knows
  // its own routes), this component never inspects `onClick` to guess it.
  active?: boolean;
}

interface AccountMenuProps {
  userName: string;
  userEmail?: string;
  // Rendered above the divider, in order. "Log out" is always appended
  // below the divider and doesn't belong in this list.
  items: AccountMenuItem[];
  onLogout: () => void;
}

// Reusable account/profile dropdown for the Header's top-right corner —
// distinct from Sidebar, which is for hospital-application navigation only
// (see DESIGN.md). Purely presentational plus its own open/close and
// keyboard-navigation state; the items themselves (and what they do) are
// entirely decided by the caller.
export default function AccountMenu({ userName, userEmail, items, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const pathname = usePathname();

  // Index items.length is the fixed "Log out" entry, always enabled.
  const disabledFlags = [...items.map((item) => !!item.disabled), false];

  // Closes on any click outside the trigger/panel — same pattern already
  // used for the hospital-search dropdown in access/page.tsx.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Closes on navigation (e.g. a future item that routes somewhere) —
  // synchronizing open state to an external signal (the route), not a
  // derived/cascading update, and a no-op when already closed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the menu in response to the route changing, not a cascading update
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = disabledFlags.findIndex((disabled) => !disabled);
    itemRefs.current[firstEnabled]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only move focus on the closed->open transition, not every time the `items` array identity changes on re-render
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocus(from: number, direction: 1 | -1) {
    const enabled = disabledFlags
      .map((disabled, index) => (disabled ? -1 : index))
      .filter((index) => index !== -1);
    const currentPos = enabled.indexOf(from);
    const nextPos = (currentPos + direction + enabled.length) % enabled.length;
    itemRefs.current[enabled[nextPos]]?.focus();
  }

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const currentIndex = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(currentIndex, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(currentIndex, -1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium text-slate-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-slate-200 ${
          open
            ? "border-teal-300 bg-teal-50/60 dark:border-teal-700 dark:bg-teal-900/20"
            : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        }`}
      >
        <Avatar name={userName} size="sm" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{userName}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" strokeWidth={2} />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-1 border-b border-slate-100 px-2.5 pt-1 pb-2.5 dark:border-slate-800">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{userName}</p>
            {userEmail && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{userEmail}</p>}
          </div>

          <div className="flex flex-col gap-0.5">
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                  className={`flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed ${
                    item.active
                      ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-900/30 dark:text-teal-400"
                      : item.disabled
                        ? "text-slate-400 dark:text-slate-600"
                        : "font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" strokeWidth={2} />}
                    {item.label}
                  </span>
                  {item.hint && <span className="text-xs text-slate-400 dark:text-slate-500">{item.hint}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
            <button
              ref={(el) => {
                itemRefs.current[items.length] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" strokeWidth={2} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
