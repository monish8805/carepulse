import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts reads process.env when it loads, so each test sets the env first and
// then imports a fresh copy of the module.
async function loadMlFetch(apiKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv("ML_SERVICE_URL", "http://model.test:8000/");
  vi.stubEnv("ML_API_KEY", apiKey as string);
  if (apiKey === undefined) delete process.env.ML_API_KEY;
  return (await import("../utils/mlClient")).mlFetch;
}

describe("mlFetch", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the API key as X-API-Key and keeps the caller's own headers, method and body", async () => {
    const mlFetch = await loadMlFetch("s3cret-key");
    await mlFetch("/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://model.test:8000/predict");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers.get("X-API-Key")).toBe("s3cret-key");
    expect(init.headers.get("Content-Type")).toBe("application/json");
  });

  it("sends no key header when none is configured", async () => {
    const mlFetch = await loadMlFetch(undefined);
    await mlFetch("/models");
    expect(fetchSpy.mock.calls[0][1].headers.has("X-API-Key")).toBe(false);
  });

  it("never puts the key in the URL", async () => {
    const mlFetch = await loadMlFetch("s3cret-key");
    await mlFetch("/predict_series");
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain("s3cret-key");
  });
});
