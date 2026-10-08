import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Each run gets a brand-new SQLite file in the OS temp dir, so no existing
// database (dev.db or Postgres) is ever reset or touched by tests.
export default function setup() {
  const root = path.resolve(import.meta.dirname, "..");
  const dbFile = path.join(os.tmpdir(), `sats-in-a-bottle-test-${process.pid}-${Date.now()}.db`);
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("node", ["scripts/prisma.mjs", "db", "push", "--skip-generate"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  return () => {
    rmSync(dbFile, { force: true });
    rmSync(`${dbFile}-journal`, { force: true });
  };
}
