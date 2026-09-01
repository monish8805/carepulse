import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Don't auto-generate AGENTS.md / CLAUDE.md files.
  agentRules: false,
  // Repo root, so the app can import from ../shared (see tsconfig "@shared/*").
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
