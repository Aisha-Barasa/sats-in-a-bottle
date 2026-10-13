import { Router } from "express";
import { prisma } from "../db.js";
import { hashToken } from "../auth.js";
import { HttpError } from "../http.js";
import { recipientView, statusView } from "../serializers.js";

export const accessRouter = Router();

async function bottleForToken(token: string) {
  // Tokens are 43-char base64url; reject anything else without a DB lookup.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(404, "This bottle link is invalid or has expired");
  const access = await prisma.recipientAccess.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { bottle: { include: { lock: true, message: true } } },
  });
  if (!access) throw new HttpError(404, "This bottle link is invalid or has expired");
  return access;
}

accessRouter.get("/:token", async (req, res) => {
  const access = await bottleForToken(req.params["token"]!);
  res.json({ ...recipientView(access.bottle), redeemedAt: access.redeemedAt?.toISOString() ?? null });
});

accessRouter.get("/:token/status", async (req, res) => {
  res.json(statusView((await bottleForToken(req.params["token"]!)).bottle));
});

/** Recipient opened the bottle after unlock. Claim itself is detected on-chain by the watcher. */
accessRouter.post("/:token/redeem", async (req, res) => {
  const access = await bottleForToken(req.params["token"]!);
  if (!["unlockable", "claimed"].includes(access.bottle.status)) throw new HttpError(409, "This bottle is not ready to open yet");
  if (!access.redeemedAt) {
    await prisma.recipientAccess.update({ where: { id: access.id }, data: { redeemedAt: new Date() } });
    await prisma.event.create({ data: { bottleId: access.bottleId, type: "opened" } });
  }
  res.json({ ok: true });
});
