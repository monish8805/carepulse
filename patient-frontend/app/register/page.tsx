"use client";

import { useState } from "react";
import Link from "next/link";
import { register, verifyOtp } from "@/lib/api";
import { Alert, Button, Card, TextField } from "@/components/ui";

export default function RegisterPage() {
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({ name, email, password });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyOtp({ email, code });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">CarePulse</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Patient Portal — Register</p>
        </div>

        <Card>
          {step === "form" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && <Alert variant="error">{error}</Alert>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Sending code..." : "Register"}
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                We sent a verification code to <span className="font-medium">{email}</span>.
              </p>
              <TextField label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required />

              {error && <Alert variant="error">{error}</Alert>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Verifying..." : "Verify"}
              </Button>
            </form>
          )}

          {step === "done" && (
            <div className="space-y-4">
              <Alert variant="success">Your account is verified.</Alert>
              <Link href="/login">
                <Button className="w-full">Log in</Button>
              </Link>
            </div>
          )}

          {step !== "done" && (
            <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Log in
              </Link>
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
