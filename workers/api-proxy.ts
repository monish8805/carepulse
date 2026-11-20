// The browser only ever talks to its own origin. This Worker serves the built app and
// forwards /api/* to the backend, so the refresh-token cookie is first-party: it works
// with no shared domain and is not affected by third-party-cookie blocking.
interface Env {
  BACKEND_ORIGIN: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, env.BACKEND_ORIGIN);
      // Pass the Request itself: spreading it ({ ...request }) silently drops its method, headers and body.
      // "manual" hands any redirect to the browser instead of following it here.
      return fetch(new Request(target, request), { redirect: "manual" });
    }

    // /assets/* never gets here (see run_worker_first), so a missing asset is a real 404.
    // Everything else is a page route, and every page route boots from the same shell.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    return env.ASSETS.fetch(new Request(new URL("/_shell.html", request.url), request));
  },
};
