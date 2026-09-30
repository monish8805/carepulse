import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { login } from "@/lib/api";
import { broadcastAuth } from "@carepulse/portal";
import { Alert, Button, Card, TextField, ThemeToggle } from "@carepulse/ui";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login({ email, password });
      // The session query is cached for the whole visit, so a "logged out"
      // answer from before this login must be replaced, not waited out.
      queryClient.setQueryData(["session"], result.user);
      broadcastAuth("login");
      navigate({ to: "/" });
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
            <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">Hospital Portal — Log in</p>
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

          <div className="mt-4 space-y-1 text-center text-sm">
            <p>
              <Link to="/forgot-password" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
                Forgot password?
              </Link>
            </p>
            <p className="text-cp-text-muted dark:text-cp-text-muted-dark">
              No account?{" "}
              <Link to="/register" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
                Register
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
