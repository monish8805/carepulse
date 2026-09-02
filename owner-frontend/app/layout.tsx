import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CarePulse — Owner",
  description: "CarePulse owner frontend",
};

// Applies the right theme class before first paint, so there's no flash of
// the wrong theme while React hydrates. Reads a stored override (ThemeToggle
// writes "cp-theme": "light" | "dark" to localStorage) and falls back to the
// OS preference when nothing's been chosen yet. Must run synchronously,
// inline, as early in <body> as possible — it can't be a regular component,
// since localStorage/matchMedia aren't available during server rendering.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("cp-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
