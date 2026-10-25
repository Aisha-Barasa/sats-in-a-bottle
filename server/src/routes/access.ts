import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashToken } from "../auth.js";
import { HttpError, parse } from "../http.js";
import { config } from "../config.js";
import { feeForRate, finalizeClaim, prepareClaim, serviceFeeFor, type ClaimInput } from "../bitcoin/claim.js";
import type { NetworkName } from "../bitcoin/cltv.js";
import type { ChainClient } from "../chain/mempool.js";
import { recipientView, statusView } from "../serializers.js";

const addressSchema = z.string().trim().min(14).max(100);
// Floor for test networks, whose fee estimates are often 0 or 1.
const MIN_FEE_RATE = 2;

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

type Access = Awaited<ReturnType<typeof bottleForToken>>;

/** The on-chain coin a claim spends, or a 409 explaining why there isn't one yet. */
function claimable(access: Access): Omit<ClaimInput, "address" | "feeSats"> {
  const { bottle } = access;
  if (bottle.status === "claimed") throw new HttpError(409, "These sats have already been claimed");
  if (bottle.status !== "unlockable") throw new HttpError(409, "This bottle is not ready to open yet");
  const lock = bottle.lock;
  if (!lock?.txid || lock.vout == null || !lock.amountSats) {
    throw new HttpError(409, "No on-chain payment was found for this bottle, so there is nothing to claim");
  }
  // The rate is the one the sender agreed to when the bottle was created.
  const serviceSats = config.SERVICE_FEE_ADDRESS ? serviceFeeFor(lock.amountSats, bottle.serviceFeeBps) : 0;
  return {
    network: lock.network as NetworkName,
    witnessScript: lock.witnessScript,
    txid: lock.txid,
    vout: lock.vout,
    valueSats: lock.amountSats,
    serviceFee: serviceSats ? { address: config.SERVICE_FEE_ADDRESS!, sats: serviceSats } : null,
  };
}

export function accessRouter(chain: ChainClient | null) {
  const router = Router();

  function requireChain(): ChainClient {
    if (!chain) throw new HttpError(503, "Claiming is not available on this server");
    return chain;
  }

  router.get("/:token", async (req, res) => {
    const access = await bottleForToken(req.params["token"]!);
    res.json({ ...recipientView(access.bottle), redeemedAt: access.redeemedAt?.toISOString() ?? null });
  });

  router.get("/:token/status", async (req, res) => {
    res.json(statusView((await bottleForToken(req.params["token"]!)).bottle));
  });

  /** Recipient opened the bottle after unlock. Claim itself is detected on-chain by the watcher. */
  router.post("/:token/redeem", async (req, res) => {
    const access = await bottleForToken(req.params["token"]!);
    if (!["unlockable", "claimed"].includes(access.bottle.status)) throw new HttpError(409, "This bottle is not ready to open yet");
    if (!access.redeemedAt) {
      await prisma.recipientAccess.update({ where: { id: access.id }, data: { redeemedAt: new Date() } });
      await prisma.event.create({ data: { bottleId: access.bottleId, type: "opened" } });
    }
    res.json({ ok: true });
  });

  /**
   * Step 1 of a claim: the server builds the spend to the recipient's address and
   * returns the sighash. The recipient's browser signs it with the gift key.
   */
  router.post("/:token/claim/prepare", async (req, res) => {
    const { address } = parse(z.object({ address: addressSchema }), req.body);
    const coin = claimable(await bottleForToken(req.params["token"]!));
    const rate = Math.max(MIN_FEE_RATE, await requireChain().getFeeRate().catch(() => MIN_FEE_RATE));
    const feeSats = feeForRate({ ...coin, address }, rate);
    const { sighash, receiveSats, serviceFeeSats } = prepareClaim({ ...coin, address, feeSats });
    res.json({ address, network: coin.network, valueSats: coin.valueSats, feeSats, feeRate: rate, serviceFeeSats, receiveSats, sighash });
  });

  /** Step 2: the server rebuilds the same transaction, checks the signature and broadcasts it. */
  router.post("/:token/claim", async (req, res) => {
    const body = parse(
      z.object({ address: addressSchema, feeSats: z.number().int().positive(), signature: z.string().regex(/^[0-9a-f]{128}$/i) }),
      req.body,
    );
    const access = await bottleForToken(req.params["token"]!);
    const coin = claimable(access);
    // Guards against a fat-fingered or tampered fee eating the gift.
    if (body.feeSats > coin.valueSats / 2) throw new HttpError(400, "Fee is more than half the bottle");
    const signed = finalizeClaim({ ...coin, address: body.address, feeSats: body.feeSats }, body.signature.toLowerCase());
    const serviceFeeSats = coin.serviceFee?.sats ?? 0;
    const txid = await requireChain().broadcast(signed.hex);
    await prisma.event.create({
      data: {
        bottleId: access.bottleId,
        type: "claim_broadcast",
        metadata: JSON.stringify({ txid, address: body.address, feeSats: body.feeSats, serviceFeeSats }),
      },
    });
    res.status(201).json({ txid, serviceFeeSats, receiveSats: coin.valueSats - body.feeSats - serviceFeeSats });
  });

  return router;
}
