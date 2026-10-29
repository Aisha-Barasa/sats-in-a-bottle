import path from "node:path";
import { fileURLToPath } from "node:url";
import * as bitcoin from "bitcoinjs-lib";
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

  // Service fee taken as a second output when a bottle is claimed in the app, in basis points
  // (150 = 1.5%). Each bottle keeps the rate it was created with. Needs SERVICE_FEE_ADDRESS.
  SERVICE_FEE_BPS: z.coerce.number().int().min(0).max(1000).default(0),
  SERVICE_FEE_ADDRESS: z.string().trim().optional(),

  // Demo-only shortcuts (skip a bottle to its next state). Refused on mainnet.
  DEV_TOOLS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
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
  // Skipping ahead moves no coins, so it is safe on test networks, including a hosted demo.
  if (cfg.DEV_TOOLS && cfg.BITCOIN_NETWORK === "mainnet") {
    throw new Error("DEV_TOOLS=true is not allowed on mainnet");
  }
  // Vercel's filesystem is read-only and wiped between requests, so SQLite can't work there.
  if (process.env["VERCEL"] && cfg.DATABASE_URL.startsWith("file:")) {
    throw new Error("On Vercel, DATABASE_URL must be a PostgreSQL URL");
  }
  if (cfg.FUNDING_PROVIDER === "bitika") {
    if (!cfg.BITIKA_API_KEY) throw new Error("FUNDING_PROVIDER=bitika requires BITIKA_API_KEY");
    // Key prefixes are bk_test_ / bk_live_; refuse a key that doesn't match the env.
    if (!cfg.BITIKA_API_KEY.startsWith(`bk_${cfg.BITIKA_ENV}_`)) {
      throw new Error(`BITIKA_API_KEY does not look like a ${cfg.BITIKA_ENV} key (expected bk_${cfg.BITIKA_ENV}_ prefix)`);
    }
  }
  if (cfg.SERVICE_FEE_BPS > 0) {
    if (!cfg.SERVICE_FEE_ADDRESS) throw new Error("SERVICE_FEE_BPS needs SERVICE_FEE_ADDRESS");
    const network = cfg.BITCOIN_NETWORK === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    try {
      bitcoin.address.toOutputScript(cfg.SERVICE_FEE_ADDRESS, network);
    } catch {
      throw new Error(`SERVICE_FEE_ADDRESS is not a valid ${cfg.BITCOIN_NETWORK} address`);
    }
  }
  return cfg;
}

export const config = load();

export const mempoolApiUrl = config.MEMPOOL_API_URL ?? MEMPOOL_DEFAULTS[config.BITCOIN_NETWORK];

// Bitika serves sandbox and live from the same host; the key decides which.
export const bitikaBaseUrl = (config.BITIKA_BASE_URL || "https://bitikaserver.up.railway.app").replace(/\/+$/, "");

/** The fee new bottles are created with: off unless both the rate and the address are set. */
export const serviceFeeBps = config.SERVICE_FEE_ADDRESS ? config.SERVICE_FEE_BPS : 0;

export const isSqlite = config.DATABASE_URL.startsWith("file:");
