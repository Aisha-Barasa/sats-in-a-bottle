import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverRoot, ".env"), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  // postgres://... for PostgreSQL, file:./dev.db for the local SQLite fallback.
  DATABASE_URL: z.string().default("file:./dev.db"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),

  BITCOIN_NETWORK: z.enum(["signet", "testnet", "mainnet"]).default("signet"),
  MEMPOOL_API_URL: z.string().url().optional(),
  MIN_CONFIRMATIONS: z.coerce.number().int().min(1).default(1),
  WATCHER_INTERVAL_MS: z.coerce.number().int().min(0).default(30_000),

  FUNDING_PROVIDER: z.enum(["bitika", "none"]).default("none"),
  BITIKA_ENV: z.enum(["test", "live"]).default("test"),
  BITIKA_API_KEY: z.string().optional(),
  BITIKA_BASE_URL: z.string().optional(),
  BITIKA_WEBHOOK_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

const MEMPOOL_DEFAULTS: Record<Config["BITCOIN_NETWORK"], string> = {
  mainnet: "https://mempool.space/api",
  testnet: "https://mempool.space/testnet4/api",
  signet: "https://mempool.space/signet/api",
};

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report only the variable names, never their values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration: ${names}`);
  }
  const cfg = parsed.data;
  if (cfg.BITIKA_ENV === "live" && cfg.BITCOIN_NETWORK !== "mainnet") {
    throw new Error("BITIKA_ENV=live requires BITCOIN_NETWORK=mainnet");
  }
  return cfg;
}

export const config = load();

export const mempoolApiUrl = config.MEMPOOL_API_URL ?? MEMPOOL_DEFAULTS[config.BITCOIN_NETWORK];

export const isSqlite = config.DATABASE_URL.startsWith("file:");
