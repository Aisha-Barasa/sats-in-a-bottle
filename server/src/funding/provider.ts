/**
 * Fiat on-ramp abstraction. Providers only deliver sats to the *sender's own*
 * Lightning wallet; the sender then pays the bottle's on-chain lock address.
 * A provider's "fulfilled" never moves a bottle to funded: only the chain
 * watcher does that, from on-chain data.
 */

export type ProviderStatus = "processing" | "processing_payment" | "fulfilled" | "failed" | "payment_failed";

export const TERMINAL_STATUSES: ReadonlySet<ProviderStatus> = new Set(["fulfilled", "failed", "payment_failed"]);

export type FundingQuote = {
  kesAmount: number;
  sats: number;
  satsBeforeFee: number;
  feeSats: number;
  feePercentage: number;
  btcPriceKes: number;
  quotedAt: string;
};

export type InitiateRequest = {
  kesAmount: number;
  phone: string; // 2547XXXXXXXX / 2541XXXXXXXX
  lightningAddress: string;
  idempotencyKey: string;
};

export type ProviderTransaction = {
  reference: string;
  status: ProviderStatus;
  sats?: number | undefined;
  kesAmount?: number | undefined;
  mpesaReceipt?: string | undefined;
  declineReason?: string | null | undefined;
};

export type WebhookEvent = {
  id: string;
  event: string;
  transaction: ProviderTransaction;
};

export interface FundingProvider {
  readonly name: string;
  readonly minKes: number;
  readonly maxKes: number;
  quote(kesAmount: number): Promise<FundingQuote>;
  initiate(req: InitiateRequest): Promise<ProviderTransaction>;
  getTransaction(reference: string): Promise<ProviderTransaction>;
  /** Returns the parsed event if the signature is valid, otherwise null. */
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookEvent | null;
}

export class FundingProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "FundingProviderError";
  }
}

const STATUSES: readonly string[] = ["processing", "processing_payment", "fulfilled", "failed", "payment_failed"];

export function toProviderStatus(value: unknown): ProviderStatus {
  if (typeof value === "string" && STATUSES.includes(value)) return value as ProviderStatus;
  throw new FundingProviderError(`Unexpected provider status: ${String(value)}`, 502);
}

/** Normalises Kenyan numbers (07…, 01…, +254…, 254…) to 254XXXXXXXXX. */
export function normalizeKenyanPhone(input: string): string {
  const digits = input.replace(/[\s()-]/g, "").replace(/^\+/, "");
  const local = digits.startsWith("254") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[17]\d{8}$/.test(local)) throw new FundingProviderError("Enter a Safaricom number like 0712 345 678", 400);
  return `254${local}`;
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 5)}****${phone.slice(-3)}`;
}
