import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function gitCommitCount(): string {
  try {
    return execSync("git rev-list --count HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "0";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_SHA__: JSON.stringify(gitShortSha()),
    __GIT_COMMITS__: JSON.stringify(gitCommitCount()),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
    fs: {
      // Allow imports from the repo's examples/ directory (one level above client/).
      allow: [".."],
    },
  },
});
