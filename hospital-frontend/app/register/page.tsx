"use client";

import { useState } from "react";
import Link from "next/link";
import { register, verifyOtp } from "@/lib/api";

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
    <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 400 }}>
      <h1>Hospital Registration</h1>

      {step === "form" && (
        <form onSubmit={handleRegister}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <br />
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <br />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <br />
          <button type="submit" disabled={loading}>
            {loading ? "Sending code..." : "Register"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerify}>
          <p>We sent a verification code to {email}.</p>
          <input
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <br />
          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>
      )}

      {step === "done" && (
        <p>
          Your account is verified. <Link href="/login">Log in</Link>
        </p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
