import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/http.js";
import { devRouter } from "../src/routes/dev.js";
import { app, createFundableBottle, futureIso, newSession, PUBKEY } from "./helpers.js";
import { MockBitikaProvider } from "./mockBitikaProvider.js";

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("health", () => {
  it("is reachable at /health and through the web proxy at /api/health", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body).toMatchObject({ ok: true, network: "signet", fundingProvider: null, devTools: false, limits: { minSats: 1000 } });
    await request(app).get("/health").expect(200);
  });
});

describe("sender name and occasion", () => {
  it("stores them and shows them to the recipient, without the pubkey", async () => {
    const token = await newSession();
    const created = await request(app)
      .post("/api/bottles")
      .set(bearer(token))
      .send({ title: "Your 18th", recipientName: "Wangari", senderName: "Aunt Njoki", occasion: "birthday", amountSats: 5_000, unlockAt: futureIso(), recipientPubkey: PUBKEY })
      .expect(201);
    expect(created.body).toMatchObject({ senderName: "Aunt Njoki", occasion: "birthday" });

    const access = await request(app).post(`/api/bottles/${created.body.id}/access`).set(bearer(token)).expect(201);
    const seen = await request(app).get(`/api/access/${access.body.token}`).expect(200);
    expect(seen.body).toMatchObject({ senderName: "Aunt Njoki", occasion: "birthday", message: null });
    expect(seen.body).not.toHaveProperty("recipientPubkey");
  });

  it("rejects an unknown occasion", async () => {
    const token = await newSession();
    await request(app)
      .post("/api/bottles")
      .set(bearer(token))
      .send({ title: "x", recipientName: "y", occasion: "heist", amountSats: 5_000, unlockAt: futureIso() })
      .expect(400);
  });
});

describe("encrypted message envelope", () => {
  it("accepts a voice-note sized ciphertext and rejects one over the limit", async () => {
    const token = await newSession();
    const id = await createFundableBottle(token);
    const put = (ciphertext: string) =>
      request(app)
        .put(`/api/bottles/${id}/message`)
        .set(bearer(token))
        .send({ type: "voice", objectRef: "inline", ciphertext, encryptionMeta: { alg: "AES-GCM-256", iv: "aXY" } });
    await put("A".repeat(2_000_000)).expect(200);
    await put("A".repeat(10_000_000)).expect(413);
  });
});

describe("KES quote before a bottle exists", () => {
  it("prices KES in sats through the funding provider", async () => {
    const withProvider = createApp({ fundingProvider: new MockBitikaProvider(), chain: null });
    const token = await newSession();
    const res = await request(withProvider).get("/api/funding/quote?kesAmount=500").set(bearer(token)).expect(200);
    expect(res.body).toMatchObject({ kesAmount: 500, provider: "bitika" });
    expect(res.body.sats).toBeGreaterThan(0);
    await request(withProvider).get("/api/funding/quote?kesAmount=5").set(bearer(token)).expect(400);
    await request(withProvider).get("/api/funding/quote?kesAmount=500").expect(401);
    await request(app).get("/api/funding/quote?kesAmount=500").set(bearer(token)).expect(503);
  });
});

describe("dev tools", () => {
  const devApp = express().use(express.json()).use("/api/dev", devRouter).use(errorHandler);

  it("are not mounted unless DEV_TOOLS=true", async () => {
    await request(app).post("/api/dev/bottles/x/advance").set(bearer(await newSession())).expect(404);
  });

  it("skip a bottle one legal step at a time and never past claimed", async () => {
    const token = await newSession();
    const id = await createFundableBottle(token);
    await request(devApp).post(`/api/dev/bottles/${id}/advance`).set(bearer(token)).expect(409);
    await request(app).post(`/api/bottles/${id}/funding`).set(bearer(token)).expect(201);

    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push((await request(devApp).post(`/api/dev/bottles/${id}/advance`).set(bearer(token)).expect(200)).body.status);
    }
    expect(seen).toEqual(["funded", "sealed", "unlockable", "claimed"]);
    await request(devApp).post(`/api/dev/bottles/${id}/advance`).set(bearer(token)).expect(409);
    await request(devApp).post(`/api/dev/bottles/${id}/advance`).set(bearer(await newSession())).expect(404);
  });
});
