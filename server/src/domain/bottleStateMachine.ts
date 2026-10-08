import type { Prisma, PrismaClient } from "@prisma/client";

export const BOTTLE_STATUSES = [
  "draft",
  "awaiting_funding",
  "funded",
  "sealed",
  "unlockable",
  "claimed",
] as const;

export type BottleStatus = (typeof BOTTLE_STATUSES)[number];

// The only legal moves. There is deliberately no cancel/recovery edge: the
// CLTV output has no sender recovery path, so none may be implied (README 6, 12).
const TRANSITIONS: Record<BottleStatus, readonly BottleStatus[]> = {
  draft: ["awaiting_funding"],
  awaiting_funding: ["funded"],
  funded: ["sealed"],
  sealed: ["unlockable"],
  unlockable: ["claimed"],
  claimed: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal bottle transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function isBottleStatus(value: string): value is BottleStatus {
  return (BOTTLE_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  return isBottleStatus(from) && isBottleStatus(to) && TRANSITIONS[from].includes(to);
}

export function assertTransition(from: string, to: BottleStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Moves a bottle from `from` to `to` and records a status_changed Event.
 * The update is conditional on the current status, so concurrent writers
 * (watcher, webhook, poller) cannot apply the same transition twice.
 * Returns false if the bottle was no longer in `from`.
 */
export async function transitionBottle(
  db: Db,
  bottleId: string,
  from: BottleStatus,
  to: BottleStatus,
  opts: { providerRef?: string; metadata?: Record<string, unknown> } = {},
): Promise<boolean> {
  assertTransition(from, to);
  const { count } = await db.bottle.updateMany({
    where: { id: bottleId, status: from },
    data: { status: to },
  });
  if (count === 0) return false;
  await db.event.create({
    data: {
      bottleId,
      type: "status_changed",
      providerRef: opts.providerRef ?? null,
      metadata: JSON.stringify({ from, to, ...opts.metadata }),
    },
  });
  return true;
}
