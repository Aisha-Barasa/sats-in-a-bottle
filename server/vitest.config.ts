import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      FUNDING_PROVIDER: "none",
      WATCHER_INTERVAL_MS: "0",
      BITCOIN_NETWORK: "signet",
      MIN_CONFIRMATIONS: "1",
      DEV_TOOLS: "false",
    },
  },
});
