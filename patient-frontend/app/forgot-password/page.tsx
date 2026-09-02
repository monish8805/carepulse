"use client";

import { useState } from "react";
import Link from "next/link";
import { forgotPassword, resetPassword } from "@/lib/api";
import { Alert, Button, Card, TextField } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword({ email });
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetPassword({ email, code, newPassword });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">CarePulse</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Patient Portal — Forgot password</p>
        </div>

        <Card>
          {step === "email" && (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && <Alert variant="error">{error}</Alert>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Sending code..." : "Send reset code"}
              </Button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Enter the code sent to <span className="font-medium">{email}</span> and your new password.
              </p>
              <TextField label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required />
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />

              {error && <Alert variant="error">{error}</Alert>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Resetting..." : "Reset password"}
              </Button>
            </form>
          )}

          {step === "done" && (
            <div className="space-y-4">
              <Alert variant="success">Password reset.</Alert>
              <Link href="/login">
                <Button className="w-full">Log in</Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
