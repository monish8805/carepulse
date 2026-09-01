import { getBackendHealth } from "@/lib/api";

export default async function Home() {
  const isBackendRunning = await getBackendHealth();

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>CarePulse</h1>
      <p>The frontend is up and running.</p>
      <p>
        Backend status:{" "}
        {isBackendRunning ? "connected" : "not connected"}
      </p>
    </main>
  );
}
