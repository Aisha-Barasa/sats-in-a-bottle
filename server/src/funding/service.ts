import { prisma } from "../db.js";
import type { ProviderTransaction } from "./provider.js";

/**
 * Bitika state lives on Event rows keyed by providerRef (the transaction code):
 * one "funding_initiated" per attempt, then one "funding_provider_update" per
 * new provider status. Returns false if this status was already recorded.
 */
export async function recordProviderUpdate(
  provider: string,
  tx: ProviderTransaction,
  source: "webhook" | "poll",
  webhookEventId?: string,
): Promise<{ bottleId: string; recorded: boolean } | null> {
  const initiated = await prisma.event.findFirst({ where: { providerRef: tx.reference, type: "funding_initiated" } });
  if (!initiated) return null;

  const updates = await prisma.event.findMany({ where: { providerRef: tx.reference, type: "funding_provider_update" } });
  const seen = updates.some((e) => {
    const m = JSON.parse(e.metadata) as { status?: string; webhookEventId?: string };
    return m.status === tx.status || (webhookEventId !== undefined && m.webhookEventId === webhookEventId);
  });
  if (seen) return { bottleId: initiated.bottleId, recorded: false };

  await prisma.event.create({
    data: {
      bottleId: initiated.bottleId,
      type: "funding_provider_update",
      providerRef: tx.reference,
      metadata: JSON.stringify({
        provider,
        source,
        webhookEventId,
        status: tx.status,
        sats: tx.sats,
        kesAmount: tx.kesAmount,
        mpesaReceipt: tx.mpesaReceipt,
        declineReason: tx.declineReason,
      }),
    },
  });
  return { bottleId: initiated.bottleId, recorded: true };
}

export async function latestProviderStatus(reference: string): Promise<string | null> {
  const last = await prisma.event.findFirst({
    where: { providerRef: reference, type: { in: ["funding_initiated", "funding_provider_update"] } },
    orderBy: { createdAt: "desc" },
  });
  return last ? ((JSON.parse(last.metadata) as { status?: string }).status ?? null) : null;
}
