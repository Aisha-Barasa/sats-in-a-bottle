import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isSqlite } from "./config.js";

function datasourceUrl(): string {
  if (!isSqlite) return config.DATABASE_URL;
  // Match scripts/prisma.mjs: relative SQLite paths are relative to server/.
  const file = config.DATABASE_URL.slice("file:".length);
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return path.isAbsolute(file) ? config.DATABASE_URL : `file:${path.join(serverRoot, file)}`;
}

export const prisma = new PrismaClient({ datasourceUrl: datasourceUrl() });
