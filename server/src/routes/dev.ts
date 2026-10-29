import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireUser } from "../auth.js";
import { HttpError } from "../http.js";
import { nextStatus, transitionBottle, type BottleStatus } from "../domain/bottleStateMachine.js";
import { bottleView } from "../serializers.js";

/**
 * Demo shortcuts, mounted only when DEV_TOOLS=true (never on mainnet).
 * Skipping ahead does not create on-chain funds, so a skipped bottle can be opened
 * but has nothing to claim.
 */
export const devRouter = Router();
devRouter.use(requireUser);

devRouter.post("/bottles/:id/advance", async (req, res) => {
  const bottle = await prisma.bottle.findFirst({ where: { id: req.params["id"]!, ownerId: currentUser(res).id } });
  if (!bottle) throw new HttpError(404, "Bottle not found");
  if (bottle.status === "draft") throw new HttpError(409, "Prepare funding first; drafts have no timelock address yet");
  const to = nextStatus(bottle.status);
  if (!to) throw new HttpError(409, `Bottle is already ${bottle.status}`);
  await transitionBottle(prisma, bottle.id, bottle.status as BottleStatus, to, { metadata: { devTools: true } });
  const updated = await prisma.bottle.findUniqueOrThrow({ where: { id: bottle.id }, include: { lock: true, message: true } });
  res.json(bottleView(updated));
});
