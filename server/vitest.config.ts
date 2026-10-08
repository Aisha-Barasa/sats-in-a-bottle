import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["test/**/*.test.ts"],
    env: { NODE_ENV: "test", FUNDING_PROVIDER: "none", WATCHER_INTERVAL_MS: "0" },
  },
});
