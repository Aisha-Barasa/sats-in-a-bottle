import { Router } from "express";
import { z } from "zod";
import { config, serviceFeeBps } from "../config.js";
import { prisma } from "../db.js";
import { currentUser, generateToken, hashToken, requireUser } from "../auth.js";
import { HttpError, parse } from "../http.js";
import { createCltvLock, parseRecipientPubkey, type NetworkName } from "../bitcoin/cltv.js";
import { validateUnlockDate } from "../bitcoin/locktime.js";
import { BOTTLE_STATUSES, transitionBottle } from "../domain/bottleStateMachine.js";
import { bottleView, statusView } from "../serializers.js";

export const bottlesRouter = Router();
bottlesRouter.use(requireUser);

export const MIN_BOTTLE_SATS = 1_000;
export const OCCASIONS = ["birthday", "graduation", "wedding", "anniversary", "new_baby", "just_because", "other"] as const;
// Base64url of an AES-GCM envelope holding the letter plus an optional voice note and photo.
const MAX_CIPHERTEXT_CHARS = 8_000_000;
export const MESSAGE_BODY_LIMIT = "9mb";

const pubkeySchema = z.string().regex(/^0[23][0-9a-fA-F]{64}$/, "Compressed public key hex (02…/03…)");

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  recipientName: z.string().trim().min(1).max(80),
  amountSats: z.number().int().min(MIN_BOTTLE_SATS).max(2_100_000_000),
  unlockAt: z.string().datetime({ offset: true }),
  recipientPubkey: pubkeySchema.optional(),
  senderName: z.string().trim().min(1).max(80).optional(),
  occasion: z.enum(OCCASIONS).optional(),
});

const updateSchema = z.object({ recipientPubkey: pubkeySchema });

const messageSchema = z.object({
  type: z.enum(["text", "voice", "photo"]),
  objectRef: z.string().min(1).max(500),
  ciphertext: z.string().max(MAX_CIPHERTEXT_CHARS).optional(),
  encryptionMeta: z
    .object({ alg: z.string().min(1).max(40), iv: z.string().min(1).max(200) })
    .passthrough()
    // The server must never receive the decryption key.
    .refine((m) => !Object.keys(m).some((k) => /key|secret|^k$/i.test(k)), "encryptionMeta must not contain key material"),
});

async function ownedBottle(id: string, ownerId: string) {
  const bottle = await prisma.bottle.findFirst({ where: { id, ownerId }, include: { lock: true, message: true } });
  if (!bottle) throw new HttpError(404, "Bottle not found");
  return bottle;
}

/**
 * The address is a pure function of (pubkey, locktime), so two bottles for the
 * same recipient and unlock second would share one address and the watcher
 * could not tell their funding apart. Nudge the locktime forward a second at a
 * time until the address is unused.
 */
async function uniqueLock(recipientPubkey: string, locktime: number, network: NetworkName) {
  for (let offset = 0; offset < 600; offset++) {
    const lock = createCltvLock({ recipientPubkey, locktime: locktime + offset, network });
    if (!(await prisma.bitcoinLock.findUnique({ where: { address: lock.address } }))) return lock;
  }
  throw new HttpError(409, "Too many bottles share this recipient key and unlock time");
}

function fundingView(bottle: Awaited<ReturnType<typeof ownedBottle>>) {
  if (!bottle.lock) throw new HttpError(409, "Funding has not been prepared for this bottle");
  const btc = (bottle.amountSats / 1e8).toFixed(8);
  return {
    status: bottle.status,
    network: bottle.lock.network,
    address: bottle.lock.address,
    amountSats: bottle.amountSats,
    locktime: bottle.lock.locktime,
    unlockAt: bottle.unlockAt.toISOString(),
    witnessScript: bottle.lock.witnessScript,
    bip21: `bitcoin:${bottle.lock.address}?amount=${btc}`,
    txid: bottle.lock.txid,
    confirmations: bottle.lock.confirmations,
  };
}

bottlesRouter.post("/", async (req, res) => {
  const body = parse(createSchema, req.body);
  validateUnlockDate(new Date(body.unlockAt));
  if (body.recipientPubkey) parseRecipientPubkey(body.recipientPubkey);
  const bottle = await prisma.bottle.create({
    data: {
      ownerId: currentUser(res).id,
      title: body.title,
      recipientName: body.recipientName,
      amountSats: body.amountSats,
      serviceFeeBps,
      unlockAt: new Date(body.unlockAt),
      recipientPubkey: body.recipientPubkey?.toLowerCase() ?? null,
      senderName: body.senderName ?? null,
      occasion: body.occasion ?? null,
      network: config.BITCOIN_NETWORK,
      events: { create: { type: "created" } },
    },
    include: { lock: true, message: true },
  });
  res.status(201).json(bottleView(bottle));
});

bottlesRouter.get("/", async (req, res) => {
  const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
  if (status && !(BOTTLE_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Unknown status");
  const bottles = await prisma.bottle.findMany({
    where: { ownerId: currentUser(res).id, ...(status ? { status } : {}) },
    include: { lock: true, message: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(bottles.map(bottleView));
});

bottlesRouter.get("/:id", async (req, res) => {
  res.json(bottleView(await ownedBottle(req.params["id"]!, currentUser(res).id)));
});

bottlesRouter.patch("/:id", async (req, res) => {
  const body = parse(updateSchema, req.body);
  const bottle = await ownedBottle(req.params["id"]!, currentUser(res).id);
  if (bottle.status !== "draft") throw new HttpError(409, "Recipient key can only change while the bottle is a draft");
  parseRecipientPubkey(body.recipientPubkey);
  const updated = await prisma.bottle.update({
    where: { id: bottle.id },
    data: { recipientPubkey: body.recipientPubkey.toLowerCase() },
    include: { lock: true, message: true },
  });
  res.json(bottleView(updated));
});

bottlesRouter.get("/:id/status", async (req, res) => {
  res.json(statusView(await ownedBottle(req.params["id"]!, currentUser(res).id)));
});

bottlesRouter.put("/:id/message", async (req, res) => {
  const body = parse(messageSchema, req.body);
  const bottle = await ownedBottle(req.params["id"]!, currentUser(res).id);
  if (bottle.status !== "draft") throw new HttpError(409, "The message is sealed once funding starts");
  const data = {
    type: body.type,
    objectRef: body.objectRef,
    ciphertext: body.ciphertext ?? null,
    encryptionMeta: JSON.stringify(body.encryptionMeta),
  };
  await prisma.message.upsert({ where: { bottleId: bottle.id }, create: { bottleId: bottle.id, ...data }, update: data });
  await prisma.event.create({ data: { bottleId: bottle.id, type: "message_attached", metadata: JSON.stringify({ type: body.type }) } });
  res.json(bottleView(await ownedBottle(bottle.id, bottle.ownerId)));
});

/** Builds the CLTV lock and moves draft -> awaiting_funding. Idempotent once prepared. */
bottlesRouter.post("/:id/funding", async (req, res) => {
  const bottle = await ownedBottle(req.params["id"]!, currentUser(res).id);
  if (bottle.lock) {
    res.json(fundingView(bottle));
    return;
  }
  if (bottle.status !== "draft") throw new HttpError(409, `Bottle is ${bottle.status}`);
  if (!bottle.recipientPubkey) throw new HttpError(409, "Add the recipient's public key before funding");
  if (!bottle.message) throw new HttpError(409, "Attach the encrypted message before funding");
  // Re-validate: the unlock date may have passed while the bottle sat as a draft.
  const lock = await uniqueLock(bottle.recipientPubkey, validateUnlockDate(bottle.unlockAt), bottle.network as NetworkName);

  await prisma.$transaction(async (tx) => {
    await tx.bitcoinLock.create({
      data: {
        bottleId: bottle.id,
        network: lock.network,
        address: lock.address,
        witnessScript: lock.witnessScript,
        locktime: lock.locktime,
        recipientPubkey: lock.recipientPubkey,
      },
    });
    const moved = await transitionBottle(tx, bottle.id, "draft", "awaiting_funding", { metadata: { address: lock.address } });
    if (!moved) throw new HttpError(409, "Bottle changed concurrently; retry");
  });
  res.status(201).json(fundingView(await ownedBottle(bottle.id, bottle.ownerId)));
});

bottlesRouter.get("/:id/funding", async (req, res) => {
  res.json(fundingView(await ownedBottle(req.params["id"]!, currentUser(res).id)));
});

/** Issues a recipient share token. Returned once; only its hash is stored. */
bottlesRouter.post("/:id/access", async (req, res) => {
  const bottle = await ownedBottle(req.params["id"]!, currentUser(res).id);
  const token = generateToken();
  await prisma.recipientAccess.create({ data: { bottleId: bottle.id, tokenHash: hashToken(token) } });
  await prisma.event.create({ data: { bottleId: bottle.id, type: "access_issued" } });
  res.status(201).json({ token, url: `${config.PUBLIC_APP_URL}/open/${token}` });
});
