import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createFundableBottle, newSession } from "./helpers.js";
import { MockBitikaProvider } from "./mockBitikaProvider.js";

let provider: MockBitikaProvider;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  provider = new MockBitikaProvider();
  app = createApp({ fundingProvider: provider });
});

async function awaitingBottle() {
  const token = await newSession();
  const id = await createFundableBottle(token);
  const auth = { Authorization: `Bearer ${token}` };
  await request(app).post(`/api/bottles/${id}/funding`).set(auth).expect(201);
  return { id, auth };
}

function signedWebhook(payload: object) {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", provider.webhookSecret).update(`${t}.${body}`).digest("hex");
  return request(app).post("/api/webhooks/bitika").set("Content-Type", "application/json").set("X-Bitika-Signature", `t=${t},v1=${v1}`).send(body);
}

describe("M-Pesa funding via provider", () => {
  it("quotes and says whether the quote covers the bottle", async () => {
    const { id, auth } = await awaitingBottle();
    const res = await request(app).get(`/api/bottles/${id}/funding/mpesa/quote?kesAmount=100`).set(auth).expect(200);
    expect(res.body).toMatchObject({ provider: "bitika", kesAmount: 100, bottleAmountSats: 100_000, coversBottle: false });
    await request(app).get(`/api/bottles/${id}/funding/mpesa/quote?kesAmount=5`).set(auth).expect(400);
    await request(app).get(`/api/bottles/${id}/funding/mpesa/quote?kesAmount=10001`).set(auth).expect(400);
  });

  it("initiates, stores the transaction code on Event and BitcoinLock, and dedupes retries", async () => {
    const { id, auth } = await awaitingBottle();
    const idempotencyKey = randomUUID();
    const body = { kesAmount: 100, phone: "0712 345 678", lightningAddress: "Me@Blink.sv", idempotencyKey };
    const first = await request(app).post(`/api/bottles/${id}/funding/mpesa`).set(auth).send(body).expect(201);
    expect(first.body).toMatchObject({ transactionCode: expect.stringMatching(/^SBX-[0-9A-F]{8}$/), status: "processing" });
    const code = first.body.transactionCode as string;
    expect(first.body.lockAddress).toMatch(/^tb1q/);
    expect(provider.initiated[0]).toMatchObject({ phone: "254712345678", lightningAddress: "me@blink.sv", idempotencyKey });

    const retry = await request(app).post(`/api/bottles/${id}/funding/mpesa`).set(auth).send(body).expect(200);
    expect(retry.body.transactionCode).toBe(code);
    expect(provider.initiated).toHaveLength(1);

    const lock = await prisma.bitcoinLock.findUniqueOrThrow({ where: { bottleId: id } });
    expect(lock).toMatchObject({ fundingProvider: "bitika", providerRef: code });
    const events = await prisma.event.findMany({ where: { bottleId: id, type: "funding_initiated" } });
    expect(events).toHaveLength(1);
    const meta = JSON.parse(events[0]!.metadata);
    expect(meta.phone).toBe("25471****678"); // never the full number
    expect(events[0]!.providerRef).toBe(code);
  });

  it("does not mark the bottle funded when Bitika reports fulfilled", async () => {
    const { id, auth } = await awaitingBottle();
    const init = await request(app).post(`/api/bottles/${id}/funding/mpesa`).set(auth)
      .send({ kesAmount: 100, phone: "0712345678", lightningAddress: "me@blink.sv" }).expect(201);
    provider.statuses.set(init.body.transactionCode, "fulfilled");

    const polled = await request(app).get(`/api/bottles/${id}/funding/mpesa/${init.body.transactionCode}`).set(auth).expect(200);
    expect(polled.body).toMatchObject({ status: "fulfilled", sats: 909 });
    expect(polled.body.nextStep).toMatch(/on-chain/);
    expect((await prisma.bottle.findUniqueOrThrow({ where: { id } })).status).toBe("awaiting_funding");
  });

  it("validates input and refuses unprepared bottles", async () => {
    const { id, auth } = await awaitingBottle();
    await request(app).post(`/api/bottles/${id}/funding/mpesa`).set(auth)
      .send({ kesAmount: 100, phone: "0812345678", lightningAddress: "me@blink.sv" }).expect(400);
    await request(app).post(`/api/bottles/${id}/funding/mpesa`).set(auth)
      .send({ kesAmount: 100, phone: "0712345678", lightningAddress: "tb1qnotalightningaddress" }).expect(400);

    const token = await newSession();
    const draftId = await createFundableBottle(token);
    await request(app).post(`/api/bottles/${draftId}/funding/mpesa`).set("Authorization", `Bearer ${token}`)
      .send({ kesAmount: 100, phone: "0712345678", lightningAddress: "me@blink.sv" }).expect(409);
  });

  it("returns 503 when no provider is configured", async () => {
    const plain = createApp();
    const { id, auth } = await awaitingBottle();
    await request(plain).get(`/api/bottles/${id}/funding/mpesa/quote?kesAmount=100`).set(auth).expect(503);
  });
});

describe("Bitika webhook", () => {
  it("records signed updates once per status and ignores duplicates", async () => {
    const { id, auth } = await awaitingBottle();
    const init = await request(app).post(`/api/bottles/${id}/funding/mpesa`).set(auth)
      .send({ kesAmount: 100, phone: "0712345678", lightningAddress: "me@blink.sv" }).expect(201);
    const code = init.body.transactionCode as string;
    const evt = { id: "evt_1", event: "payment.completed", data: { transaction_code: code, status: "fulfilled", sats: 909 } };

    expect((await signedWebhook(evt).expect(200)).body).toEqual({ ok: true, matched: true });
    await signedWebhook(evt).expect(200);
    const updates = await prisma.event.findMany({ where: { providerRef: code, type: "funding_provider_update" } });
    expect(updates).toHaveLength(1);
    expect(JSON.parse(updates[0]!.metadata)).toMatchObject({ source: "webhook", status: "fulfilled", webhookEventId: "evt_1" });

    // Terminal status recorded by webhook short-circuits polling.
    const polled = await request(app).get(`/api/bottles/${id}/funding/mpesa/${code}`).set(auth).expect(200);
    expect(polled.body.status).toBe("fulfilled");
  });

  it("rejects unsigned or badly signed payloads", async () => {
    await request(app).post("/api/webhooks/bitika").set("Content-Type", "application/json").send("{}").expect(401);
    await request(app).post("/api/webhooks/bitika").set("Content-Type", "application/json")
      .set("X-Bitika-Signature", `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`).send("{}").expect(401);
  });

  it("acknowledges unknown transaction codes without matching", async () => {
    const res = await signedWebhook({ id: "evt_x", event: "payment.completed", data: { transaction_code: "SBX-UNKNOWN", status: "fulfilled" } }).expect(200);
    expect(res.body.matched).toBe(false);
  });
});
