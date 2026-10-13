import { createHmac } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { BitikaProvider, verifyBitikaSignature } from "../src/funding/bitika.js";
import { FundingProviderError, normalizeKenyanPhone } from "../src/funding/provider.js";

const KEY = "bk_test_fake_key_for_unit_tests_only_000";
const BASE = "https://bitika.example";
const NOW = 1_783_625_207_000;

function provider(responses: Array<[number, unknown]>, webhookSecret?: string) {
  const fetchImpl = vi.fn(async () => {
    const [status, body] = responses.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  });
  return { p: new BitikaProvider({ baseUrl: BASE, apiKey: KEY, webhookSecret, fetchImpl: fetchImpl as never, now: () => NOW }), fetchImpl };
}

const sign = (body: string, secret: string, t = Math.floor(NOW / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("BitikaProvider", () => {
  it("quotes via GET /api/v1/exchange/rate?amount=", async () => {
    const { p, fetchImpl } = provider([[200, { success: true, data: { kesAmount: 100, satsAmount: 909, btcPriceKes: 10657757, feePercentage: 0.03, satsBeforeFee: 938, feeInSats: 29, timestamp: "2026-10-08T13:42:42.254Z" } }]]);
    expect(await p.quote(100)).toEqual({ kesAmount: 100, sats: 909, satsBeforeFee: 938, feeSats: 29, feePercentage: 0.03, btcPriceKes: 10657757, quotedAt: "2026-10-08T13:42:42.254Z" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/v1/exchange/rate?amount=100`);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${KEY}`);
  });

  it("initiates a collect with amount as string and an Idempotency-Key", async () => {
    const { p, fetchImpl } = provider([[200, { transaction_code: "SBX-1A2B3C4D", status: "processing" }]]);
    const tx = await p.initiate({ kesAmount: 100, phone: "254712345678", lightningAddress: "me@blink.sv", idempotencyKey: "0f8c1a2e-1111-4222-8333-444455556666" });
    expect(tx).toEqual({ reference: "SBX-1A2B3C4D", status: "processing" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/v1/xwift/collect`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ amount: "100", phone: "254712345678", lightningAddress: "me@blink.sv" });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("0f8c1a2e-1111-4222-8333-444455556666");
  });

  it("reads transaction status, wrapped or not", async () => {
    const { p } = provider([
      [200, { data: { transaction_code: "SBX-1", status: "fulfilled", sats: 909, mpesa_receipt: "SBX8A2F19" } }],
      [200, { transaction_code: "SBX-2", status: "payment_failed", decline_reason: "liquidity" }],
    ]);
    expect(await p.getTransaction("SBX-1")).toMatchObject({ status: "fulfilled", sats: 909, mpesaReceipt: "SBX8A2F19" });
    expect(await p.getTransaction("SBX-2")).toMatchObject({ status: "payment_failed", declineReason: "liquidity" });
  });

  it("maps errors without ever leaking the key", async () => {
    const { p } = provider([
      [401, { message: "bad key" }],
      [503, { reason: "liquidity" }],
      [400, { message: ["amount must not be less than 10"] }],
    ]);
    const e1 = await p.quote(100).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(FundingProviderError);
    expect((e1 as Error).message).not.toContain(KEY);
    expect((e1 as FundingProviderError).status).toBe(502);
    expect(await p.quote(100).catch((e: FundingProviderError) => [e.status, e.retryable])).toEqual([503, true]);
    expect(await p.quote(1).catch((e: Error) => e.message)).toBe("amount must not be less than 10");
    expect(inspect(p)).not.toContain(KEY);
    expect(JSON.stringify({ p })).not.toContain(KEY);
  });

  it("rejects unknown statuses rather than guessing", async () => {
    const { p } = provider([[200, { transaction_code: "SBX-1", status: "weird" }]]);
    await expect(p.getTransaction("SBX-1")).rejects.toThrow(/Unexpected provider status/);
  });
});

describe("Bitika webhook signatures", () => {
  const body = JSON.stringify({ id: "evt_1", event: "payment.completed", data: { transaction_code: "SBX-1", status: "fulfilled", sats: 909 } });

  it("accepts a valid signature and parses the event", () => {
    const { p } = provider([], "whsec");
    expect(p.verifyWebhook(body, { "x-bitika-signature": sign(body, "whsec") })).toMatchObject({
      id: "evt_1",
      event: "payment.completed",
      transaction: { reference: "SBX-1", status: "fulfilled", sats: 909 },
    });
  });

  it("rejects tampering, wrong secret, replays, junk and a missing secret", () => {
    const t = Math.floor(NOW / 1000);
    expect(verifyBitikaSignature(body.replace("909", "999"), sign(body, "whsec"), "whsec", NOW)).toBe(false);
    expect(verifyBitikaSignature(body, sign(body, "other"), "whsec", NOW)).toBe(false);
    expect(verifyBitikaSignature(body, sign(body, "whsec", t - 301), "whsec", NOW)).toBe(false);
    expect(verifyBitikaSignature(body, sign(body, "whsec", t - 299), "whsec", NOW)).toBe(true);
    expect(verifyBitikaSignature(body, "t=abc,v1=zz", "whsec", NOW)).toBe(false);
    expect(verifyBitikaSignature(body, `t=${t},v1=abcd`, "whsec", NOW)).toBe(false); // short digest must not throw
    const { p } = provider([]);
    expect(p.verifyWebhook(body, { "x-bitika-signature": sign(body, "whsec") })).toBeNull();
  });
});

describe("Kenyan phone normalisation", () => {
  it.each([
    ["0712 345 678", "254712345678"],
    ["+254712345678", "254712345678"],
    ["254112345678", "254112345678"],
    ["0112-345-678", "254112345678"],
  ])("%s -> %s", (input, expected) => expect(normalizeKenyanPhone(input)).toBe(expected));

  it("rejects non-Kenyan or malformed numbers", () => {
    expect(() => normalizeKenyanPhone("0812345678")).toThrow();
    expect(() => normalizeKenyanPhone("+1 555 123 4567")).toThrow();
  });
});
