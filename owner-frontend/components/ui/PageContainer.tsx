import type { ReactNode } from "react";

// The one page-width convention for CarePulse content — every page's top-
// level element should be this, so column width/padding stays consistent
// whether or not the page happens to sit inside the portal shell.
export default function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>;
}
