import { ML_API_KEY, ML_SERVICE_URL } from "../config/env";

export function mlFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (ML_API_KEY) headers.set("X-API-Key", ML_API_KEY);
  return fetch(`${ML_SERVICE_URL}${path}`, { ...init, headers });
}
