"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { login } from "@/lib/api";
import { Alert, Button, Card, TextField, ThemeToggle } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ email, password });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-cp-page px-4 py-12 dark:bg-cp-page-dark">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cp-primary text-white dark:bg-cp-primary-dark">
            <Activity className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
          </span>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-cp-text dark:text-cp-text-dark">CarePulse</h1>
            <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">Owner Portal — Log in</p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Logging in..." : "Log in"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
