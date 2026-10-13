import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { currentUser, generateToken, hashToken, requireUser } from "../auth.js";
import { parse } from "../http.js";

export const sessionRouter = Router();

/** Creates a lightweight sender account and returns its bearer token once. */
sessionRouter.post("/", async (req, res) => {
  const body = parse(z.object({ displayName: z.string().trim().min(1).max(80).default("Sender") }), req.body ?? {});
  const token = generateToken();
  const user = await prisma.user.create({ data: { displayName: body.displayName, tokenHash: hashToken(token) } });
  res.status(201).json({ userId: user.id, displayName: user.displayName, token });
});

sessionRouter.get("/me", requireUser, (_req, res) => {
  const user = currentUser(res);
  res.json({ userId: user.id, displayName: user.displayName });
});
