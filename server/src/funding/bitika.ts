import { createHmac, timingSafeEqual } from "node:crypto";
import {
  FundingProviderError,
  toProviderStatus,
  type FundingProvider,
  type FundingQuote,
  type InitiateRequest,
  type ProviderTransaction,
  type WebhookEvent,
} from "./provider.js";

export type BitikaOptions = {
  baseUrl: string;
  apiKey: string;
  webhookSecret?: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * https://bitika.xyz/developers/docs — sandbox (bk_test_) and live (bk_live_)
 * share endpoints and payloads, so switching is a config change only.
 */
export class BitikaProvider implements FundingProvider {
  readonly name = "bitika";
  readonly minKes = 10;
  readonly maxKes = 10_000;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;

  constructor(private readonly opts: BitikaOptions) {
    this.#apiKey = opts.apiKey;
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#now = opts.now ?? Date.now;
  }

  // Keep the key out of console.log / util.inspect / JSON.stringify.
  toJSON() {
    return { name: this.name, baseUrl: this.opts.baseUrl };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `BitikaProvider(${this.opts.baseUrl})`;
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }) {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.#apiKey}`, Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

    let res: Response;
    try {
      res = await this.#fetch(`${this.opts.baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? null : JSON.stringify(init.body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new FundingProviderError("Could not reach Bitika", 503, true);
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) throw toError(res.status, json);
    return json as Record<string, unknown>;
  }

  async quote(kesAmount: number): Promise<FundingQuote> {
    const body = await this.request(`/api/v1/exchange/rate?amount=${encodeURIComponent(kesAmount)}`, { method: "GET" });
    const d = (body["data"] ?? {}) as Record<string, unknown>;
    if (typeof d["satsAmount"] !== "number") throw new FundingProviderError("Unexpected quote response from Bitika", 502);
    return {
      kesAmount: Number(d["kesAmount"]),
      sats: Number(d["satsAmount"]),
      satsBeforeFee: Number(d["satsBeforeFee"]),
      feeSats: Number(d["feeInSats"]),
      feePercentage: Number(d["feePercentage"]),
      btcPriceKes: Number(d["btcPriceKes"]),
      quotedAt: String(d["timestamp"] ?? new Date(this.#now()).toISOString()),
    };
  }

  async initiate(req: InitiateRequest): Promise<ProviderTransaction> {
    const body = await this.request("/api/v1/xwift/collect", {
      method: "POST",
      idempotencyKey: req.idempotencyKey,
      body: { amount: String(req.kesAmount), phone: req.phone, lightningAddress: req.lightningAddress },
    });
    const tx = unwrap(body);
    if (typeof tx["transaction_code"] !== "string") throw new FundingProviderError("Bitika did not return a transaction code", 502);
    return { reference: tx["transaction_code"], status: toProviderStatus(tx["status"]) };
  }

  async getTransaction(reference: string): Promise<ProviderTransaction> {
    const body = await this.request(`/api/v1/transactions/code/${encodeURIComponent(reference)}`, { method: "GET" });
    return parseTransaction(unwrap(body), reference);
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookEvent | null {
    const secret = this.opts.webhookSecret;
    const header = headers["x-bitika-signature"];
    if (!secret || !header) return null;
    if (!verifyBitikaSignature(rawBody, header, secret, this.#now())) return null;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
    const data = (payload["data"] ?? {}) as Record<string, unknown>;
    if (typeof payload["id"] !== "string" || typeof data["transaction_code"] !== "string") return null;
    return {
      id: payload["id"],
      event: String(payload["event"]),
      transaction: parseTransaction(data, data["transaction_code"]),
    };
  }
}

/** HMAC-SHA256 over "<t>.<raw body>", header "t=<unix>,v1=<hex>", 5-minute replay window. */
export function verifyBitikaSignature(rawBody: string, header: string, secret: string, nowMs: number): boolean {
  const parts = new Map(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1 || !/^\d+$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}

// Responses are either the object itself or wrapped as { success, data }.
function unwrap(body: Record<string, unknown>): Record<string, unknown> {
  const data = body["data"];
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : body;
}

function parseTransaction(d: Record<string, unknown>, reference: string): ProviderTransaction {
  return {
    reference: typeof d["transaction_code"] === "string" ? d["transaction_code"] : reference,
    status: toProviderStatus(d["status"]),
    sats: typeof d["sats"] === "number" ? d["sats"] : undefined,
    kesAmount: typeof d["amount_kes"] === "number" ? d["amount_kes"] : undefined,
    mpesaReceipt: typeof d["mpesa_receipt"] === "string" ? d["mpesa_receipt"] : undefined,
    declineReason: typeof d["decline_reason"] === "string" ? d["decline_reason"] : null,
  };
}

function toError(status: number, json: unknown): FundingProviderError {
  const raw = (json as { message?: unknown })?.message;
  const detail = Array.isArray(raw) ? raw.join("; ") : typeof raw === "string" ? raw : "";
  switch (status) {
    case 400:
      return new FundingProviderError(detail || "Bitika rejected the request", 400);
    case 401:
    case 403:
      // Never echo anything about the key itself.
      return new FundingProviderError("Bitika rejected our API credentials or scope", 502);
    case 404:
      return new FundingProviderError("Bitika transaction not found", 404);
    case 409:
      return new FundingProviderError("This payment was already submitted with different details", 409);
    case 429:
      return new FundingProviderError("Bitika is rate limiting requests; try again shortly", 503, true);
    case 503:
      return new FundingProviderError("Bitika is temporarily short of Lightning liquidity; try again shortly", 503, true);
    default:
      return new FundingProviderError(`Bitika error (HTTP ${status})`, 502, status >= 500);
  }
}
