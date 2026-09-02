"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { register, verifyOtp } from "@/lib/api";
import { Alert, Button, Card, Stepper, TextField, ThemeToggle } from "@/components/ui";

const STEP_LABELS = ["Details", "Password", "Verify"];

export default function RegisterPage() {
  const [step, setStep] = useState<"details" | "password" | "otp" | "done">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const stepIndex = { details: 0, password: 1, otp: 2, done: 2 }[step];

  function handleDetailsContinue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("password");
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({ name, email, phone, password });
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
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Activity className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
          </span>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Create your account
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">CarePulse Hospital Portal</p>
          </div>
        </div>

        {step !== "done" && (
          <div className="mb-6">
            <Stepper labels={STEP_LABELS} currentIndex={stepIndex} />
          </div>
        )}

        <Card>
          {step === "details" && (
            <form onSubmit={handleDetailsContinue} className="space-y-4">
              <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <TextField
                label="Phone"
                type="tel"
                autoComplete="tel"
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />

              {error && <Alert variant="error">{error}</Alert>}

              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handleRegister} className="space-y-4">
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
                {loading ? "Sending code..." : "Continue"}
              </Button>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="block w-full text-center text-sm text-slate-500 hover:underline dark:text-slate-400"
              >
                ← Back
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                We sent a verification code to <span className="font-medium">{email}</span>.
              </p>
              <TextField
                label="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />

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
              <Link href="/login" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                Log in
              </Link>
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
