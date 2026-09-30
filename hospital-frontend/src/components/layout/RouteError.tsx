import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Alert, Button, Card } from "@/components/ui";

// The router's defaultErrorComponent: shown instead of a blank page when a
// route throws while rendering or loading. "Try again" re-runs the route.
export default function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-lg font-semibold text-cp-text dark:text-cp-text-dark">Something went wrong</h1>
          <Alert variant="error">{error instanceof Error && error.message ? error.message : "This page couldn't be shown."}</Alert>
          <Button onClick={() => router.invalidate()}>Try again</Button>
        </div>
      </Card>
    </div>
  );
}
