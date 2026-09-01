import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't auto-generate AGENTS.md / CLAUDE.md files.
  agentRules: false,
};

export default nextConfig;
