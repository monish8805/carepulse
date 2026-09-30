import type { BrowserContext, Page, Request } from "@playwright/test";

export interface Reply {
  status?: number;
  body?: unknown;
}

// `params` holds the values of any `:name` segments in the route key.
export type Handler = (request: Request, params: Record<string, string>) => Reply | Promise<Reply>;

export const BACKEND = "http://localhost:5001";

// An in-memory stand-in for the Express API. Routes are keyed
// "METHOD /path/:param"; anything unmatched answers 500 so a missing mock is
// loud. Every request is recorded in `calls` (as "METHOD /path") so tests can
// assert what the app did — and did not — ask for.
export class FakeBackend {
  calls: string[] = [];
  private routes: { method: string; pattern: RegExp; names: string[]; handler: Handler }[] = [];

  constructor(routes: Record<string, Handler>, private delayMs = 0) {
    this.on({ "GET /api/health": () => ({ body: { status: "ok" } }), ...routes });
  }

  on(routes: Record<string, Handler>) {
    for (const [key, handler] of Object.entries(routes)) {
      const [method, path] = key.split(" ");
      const names: string[] = [];
      const pattern = new RegExp(
        "^" + path.replace(/:(\w+)/g, (_, name) => (names.push(name), "([^/]+)")) + "$"
      );
      // Later registrations win, so a test can override a default route.
      this.routes.unshift({ method, pattern, names, handler });
    }
    return this;
  }

  count(key: string, since = 0) {
    return this.calls.slice(since).filter((call) => call === key).length;
  }

  async attach(target: Page | BrowserContext) {
    await target.route(`${BACKEND}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      this.calls.push(`${request.method()} ${url.pathname}`);
      for (const r of this.routes) {
        const match = request.method() === r.method && url.pathname.match(r.pattern);
        if (!match) continue;
        const params = Object.fromEntries(r.names.map((name, i) => [name, match[i + 1]]));
        const reply = await r.handler(request, params);
        if (this.delayMs && !url.pathname.startsWith("/api/auth/")) {
          await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        }
        return route.fulfill({
          status: reply.status ?? 200,
          contentType: "application/json",
          body: JSON.stringify(reply.body ?? {}),
        });
      }
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: `unmocked ${request.method()} ${url.pathname}` }) });
    });
    return this;
  }
}

export const json = (body: unknown, status = 200): Reply => ({ status, body });
