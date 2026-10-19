import { randomBytes } from "node:crypto";
import { verifyBitikaSignature } from "../src/funding/bitika.js";
import type {
  FundingProvider,
  FundingQuote,
  InitiateRequest,
  ProviderStatus,
  ProviderTransaction,
  WebhookEvent,
} from "../src/funding/provider.js";

/** Test double that mirrors Bitika sandbox behaviour, including its phone-suffix failure modes. */
export class MockBitikaProvider implements FundingProvider {
  readonly name = "bitika";
  readonly minKes = 10;
  readonly maxKes = 10_000;
  readonly webhookSecret = "whsec_test";
  readonly byIdempotencyKey = new Map<string, ProviderTransaction>();
  readonly statuses = new Map<string, ProviderStatus>();
  initiated: InitiateRequest[] = [];

  async quote(kesAmount: number): Promise<FundingQuote> {
    const satsBeforeFee = Math.floor(kesAmount * 9.38);
    const feeSats = Math.round(satsBeforeFee * 0.03);
    return { kesAmount, sats: satsBeforeFee - feeSats, satsBeforeFee, feeSats, feePercentage: 0.03, btcPriceKes: 10_657_757, quotedAt: new Date().toISOString() };
  }

  async initiate(req: InitiateRequest): Promise<ProviderTransaction> {
    const replay = this.byIdempotencyKey.get(req.idempotencyKey);
    if (replay) return replay;
    this.initiated.push(req);
    const tx: ProviderTransaction = { reference: `SBX-${randomBytes(4).toString("hex").toUpperCase()}`, status: "processing" };
    this.byIdempotencyKey.set(req.idempotencyKey, tx);
    this.statuses.set(tx.reference, "processing");
    return tx;
  }

  async getTransaction(reference: string): Promise<ProviderTransaction> {
    return { reference, status: this.statuses.get(reference) ?? "processing", sats: 909 };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookEvent | null {
    const header = headers["x-bitika-signature"];
    if (!header || !verifyBitikaSignature(rawBody, header, this.webhookSecret, Date.now())) return null;
    const p = JSON.parse(rawBody) as { id: string; event: string; data: { transaction_code: string; status: ProviderStatus; sats?: number } };
    return { id: p.id, event: p.event, transaction: { reference: p.data.transaction_code, status: p.data.status, sats: p.data.sats } };
  }
}
