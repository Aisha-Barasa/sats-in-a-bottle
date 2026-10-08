import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";

/** 256-bit random token, URL-safe. Only its hash is ever stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing bearer token");
  const user = await prisma.user.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!user) throw new HttpError(401, "Invalid token");
  res.locals["user"] = user;
  next();
}

export function currentUser(res: Response): User {
  return res.locals["user"] as User;
}
