import type { ReactNode } from "react";

// The one page-width convention for CarePulse content — every page's top-
// level element should be this, so column width/padding stays consistent
// whether or not the page happens to sit inside the portal shell.
// Deliberately no background of its own — it's a width/spacing wrapper only.
// The "workspace" surface tone (CarePulse token system, see DESIGN.md) is
// applied by the full-width wrapper around this in each <Portal>Layout, so it
// reads as one continuous surface behind the centered column, not a narrower
// tinted box floating inside a differently-toned margin.
export default function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>;
}
