// Base URL of the backend API, e.g. http://localhost:5000
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Calls the backend health-check endpoint and returns whether it responded.
export async function getBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}
