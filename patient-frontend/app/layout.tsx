import type { Metadata } from "next";
import { DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

// Weight must be listed explicitly — Space Mono only ships 400/700, it has no
// variable-weight axis for next/font to default to.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CarePulse — Patient",
  description: "CarePulse patient frontend",
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
    <html lang="en" className={`${dmSans.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-cp-page font-sans text-cp-text antialiased dark:bg-cp-page-dark dark:text-cp-text-dark">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
