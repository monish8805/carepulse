"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@shared/types";
import { restoreSession, logout } from "@/lib/api";
import Header from "./Header";

// Owns the application shell (header only — no sidebar yet, see layout.css)
// for every route under app/(portal)/. Deliberately does its own lightweight
// session check to know whether to show navigation chrome at all — it does
// NOT gate or replace the page's own auth handling below it. While no
// session is confirmed yet (or there isn't one), children render bare,
// exactly as they did before this shell existed. Session enforcement itself
// still lives entirely server-side — this is presentation only.
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then((restored) => {
        if (!cancelled) setUser(restored);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
    router.push("/login");
  }

  if (checkingSession || !user) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="CarePulse — Patient"
        userName={user.name}
        userEmail={user.email}
        onLogout={handleLogout}
        showMenuButton={false}
        mobileMenuOpen={false}
        onToggleMobileMenu={() => {}}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
