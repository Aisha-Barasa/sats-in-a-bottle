import { randomUUID } from "node:crypto";
import { Router, raw } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { currentUser, requireUser } from "../auth.js";
import { HttpError, parse } from "../http.js";
import {
  FundingProviderError,
  TERMINAL_STATUSES,
  maskPhone,
  normalizeKenyanPhone,
  type FundingProvider,
  type ProviderStatus,
} from "../funding/provider.js";
import { latestProviderStatus, recordProviderUpdate } from "../funding/service.js";

const NEXT_STEP: Record<ProviderStatus, string> = {
  processing: "Approve the M-Pesa prompt on your phone.",
  processing_payment: "M-Pesa paid. Sats are on their way to your Lightning wallet.",
  fulfilled: "Sats delivered to your Lightning wallet. Now send them on-chain to the bottle address to seal it.",
  failed: "M-Pesa declined the payment. No money moved. You can try again.",
  payment_failed: "M-Pesa took the payment but the Lightning payout failed. Contact Bitika support with the transaction code.",
};

function requireProvider(provider: FundingProvider | null): FundingProvider {
  if (!provider) throw new HttpError(503, "Mobile-money funding is not enabled on this server");
  return provider;
}

function handleProviderError(err: unknown): never {
  if (err instanceof FundingProviderError) throw new HttpError(err.status, err.message, { retryable: err.retryable });
  throw err;
}

/** GET /api/funding/quote?kesAmount= : KES -> sats before a bottle exists (the create wizard prices in shillings). */
export function quoteRouter(provider: FundingProvider | null) {
  const router = Router();
  router.use(requireUser);
  router.get("/quote", async (req, res) => {
    const p = requireProvider(provider);
    const { kesAmount } = parse(z.object({ kesAmount: z.coerce.number().int().min(p.minKes).max(p.maxKes) }), req.query);
    const quote = await p.quote(kesAmount).catch(handleProviderError);
    res.json({ ...quote, provider: p.name });
  });
  return router;
}

/** Owner-facing M-Pesa -> Lightning endpoints, mounted under /api/bottles/:id/funding/mpesa. */
export function mpesaRouter(provider: FundingProvider | null) {
  const router = Router({ mergeParams: true });
  router.use(requireUser);

  const kes = () => z.coerce.number().int().min(provider?.minKes ?? 10).max(provider?.maxKes ?? 10_000);

  async function bottleAwaitingFunding(id: string, ownerId: string) {
    const bottle = await prisma.bottle.findFirst({ where: { id, ownerId }, include: { lock: true } });
    if (!bottle) throw new HttpError(404, "Bottle not found");
    if (!bottle.lock) throw new HttpError(409, "Prepare funding for this bottle first");
    return { ...bottle, lock: bottle.lock };
  }

  router.get("/quote", async (req, res) => {
    const p = requireProvider(provider);
    const { kesAmount } = parse(z.object({ kesAmount: kes() }), req.query);
    const bottle = await bottleAwaitingFunding((req.params as { id: string }).id, currentUser(res).id);
    const quote = await p.quote(kesAmount).catch(handleProviderError);
    res.json({ ...quote, provider: p.name, bottleAmountSats: bottle.amountSats, coversBottle: quote.sats >= bottle.amountSats });
  });

  router.post("/", async (req, res) => {
    const p = requireProvider(provider);
    const body = parse(
      z.object({
        kesAmount: kes(),
        phone: z.string().min(9).max(20),
        lightningAddress: z.string().trim().toLowerCase().regex(/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/, "Lightning address like name@blink.sv"),
        // Client-generated per attempt so a retried request can never double-charge.
        idempotencyKey: z.string().uuid().optional(),
      }),
      req.body,
    );
    const bottle = await bottleAwaitingFunding((req.params as { id: string }).id, currentUser(res).id);
    if (bottle.status !== "awaiting_funding") throw new HttpError(409, `Bottle is already ${bottle.status}`);
    const phone = (() => {
      try {
        return normalizeKenyanPhone(body.phone);
      } catch (err) {
        return handleProviderError(err);
      }
    })();
    const idempotencyKey = body.idempotencyKey ?? randomUUID();

    const quote = await p.quote(body.kesAmount).catch(() => null);
    const tx = await p
      .initiate({ kesAmount: body.kesAmount, phone, lightningAddress: body.lightningAddress, idempotencyKey })
      .catch(handleProviderError);

    // A replayed Idempotency-Key returns the same code; don't record it twice.
    const existing = await prisma.event.findFirst({ where: { providerRef: tx.reference, type: "funding_initiated" } });
    if (!existing) {
      await prisma.$transaction([
        prisma.event.create({
          data: {
            bottleId: bottle.id,
            type: "funding_initiated",
            providerRef: tx.reference,
            metadata: JSON.stringify({
              provider: p.name,
              status: tx.status,
              kesAmount: body.kesAmount,
              quotedSats: quote?.sats ?? null,
              phone: maskPhone(phone),
              lightningAddress: body.lightningAddress,
              idempotencyKey,
            }),
          },
        }),
        prisma.bitcoinLock.update({ where: { id: bottle.lock.id }, data: { fundingProvider: p.name, providerRef: tx.reference } }),
      ]);
    }
    res.status(existing ? 200 : 201).json({
      transactionCode: tx.reference,
      status: tx.status,
      quotedSats: quote?.sats ?? null,
      lockAddress: bottle.lock.address,
      nextStep: NEXT_STEP[tx.status],
    });
  });

  /** Poll fallback for when webhooks are not configured or delayed. */
  router.get("/:code", async (req, res) => {
    const p = requireProvider(provider);
    const { id, code } = req.params as { id: string; code: string };
    const bottle = await bottleAwaitingFunding(id, currentUser(res).id);
    const initiated = await prisma.event.findFirst({ where: { bottleId: bottle.id, providerRef: code, type: "funding_initiated" } });
    if (!initiated) throw new HttpError(404, "Unknown transaction for this bottle");

    let status = (await latestProviderStatus(code)) as ProviderStatus;
    let sats: number | undefined;
    if (!TERMINAL_STATUSES.has(status)) {
      const tx = await p.getTransaction(code).catch(handleProviderError);
      await recordProviderUpdate(p.name, tx, "poll");
      status = tx.status;
      sats = tx.sats;
    }
    res.json({ transactionCode: code, status, sats: sats ?? null, lockAddress: bottle.lock.address, nextStep: NEXT_STEP[status] });
  });

  return router;
}

/** POST /api/webhooks/bitika — needs the raw body for signature verification. */
export function webhookRouter(provider: FundingProvider | null) {
  const router = Router();
  router.post("/bitika", raw({ type: "*/*", limit: "64kb" }), async (req, res) => {
    if (!provider) {
      res.status(503).json({ error: "Funding provider disabled" });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const event = provider.verifyWebhook(rawBody, {
      "x-bitika-signature": req.get("x-bitika-signature"),
      "x-bitika-event": req.get("x-bitika-event"),
    });
    if (!event) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    const result = await recordProviderUpdate(provider.name, event.transaction, "webhook", event.id);
    // 2xx for unknown codes too, so Bitika doesn't retry events we can't use.
    res.json({ ok: true, matched: Boolean(result) });
  });
  return router;
}
