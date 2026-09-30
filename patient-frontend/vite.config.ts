import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Resolves "@/*" and "@shared/*" from tsconfig.json paths.
  resolve: { tsconfigPaths: true },
  plugins: [
    // Dev-only: strips the <TanStackDevtools /> panel out of production builds.
    devtools(),
    tailwindcss(),
    // SPA mode: every page is rendered in the browser only. The access token is
    // a module-level variable in shared/api.ts, and the refresh cookie is sent
    // by the browser straight to the backend — neither exists on a render
    // server, so route loaders/SSR would run with no session (and a module
    // variable on a server is shared across every visitor's request).
    tanstackStart({ spa: { enabled: true } }),
    // Must come after tanstackStart().
    viteReact(),
  ],
});
