import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, createFundableBottle, futureIso, newSession, PUBKEY } from "./helpers.js";
import { prisma } from "../src/db.js";

describe("bottles API", () => {
  it("requires a bearer token", async () => {
    await request(app).get("/api/bottles").expect(401);
    await request(app).get("/api/bottles").set("Authorization", "Bearer nope").expect(401);
  });

  it("creates, lists and gets a draft bottle", async () => {
    const token = await newSession();
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app)
      .post("/api/bottles")
      .set(auth)
      .send({ title: "Graduation", recipientName: "Kwame", amountSats: 50_000, unlockAt: futureIso() })
      .expect(201);
    expect(res.body).toMatchObject({ status: "draft", network: "signet", hasMessage: false, lock: null, recipientPubkey: null });

    const list = await request(app).get("/api/bottles").set(auth).expect(200);
    expect(list.body.map((b: { id: string }) => b.id)).toContain(res.body.id);
    await request(app).get(`/api/bottles/${res.body.id}`).set(auth).expect(200);
    await request(app).get("/api/bottles?status=bogus").set(auth).expect(400);
  });

  it("hides other users' bottles", async () => {
    const id = await createFundableBottle(await newSession());
    const other = await newSession();
    await request(app).get(`/api/bottles/${id}`).set("Authorization", `Bearer ${other}`).expect(404);
  });

  it("validates input", async () => {
    const auth = { Authorization: `Bearer ${await newSession()}` };
    const base = { title: "x", recipientName: "y", amountSats: 50_000, unlockAt: futureIso() };
    await request(app).post("/api/bottles").set(auth).send({ ...base, amountSats: 10 }).expect(400);
    await request(app).post("/api/bottles").set(auth).send({ ...base, unlockAt: "2020-01-01T00:00:00Z" }).expect(400);
    await request(app).post("/api/bottles").set(auth).send({ ...base, recipientPubkey: `02${"ff".repeat(32)}` }).expect(400);
  });

  it("refuses encryption metadata that carries a key", async () => {
    const token = await newSession();
    const id = await createFundableBottle(token);
    await request(app)
      .put(`/api/bottles/${id}/message`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "text", objectRef: "inline", ciphertext: "x", encryptionMeta: { alg: "AES-GCM", iv: "aXY=", key: "oops" } })
      .expect(400);
  });

  it("prepares funding once and moves draft -> awaiting_funding", async () => {
    const token = await newSession();
    const auth = { Authorization: `Bearer ${token}` };
    const id = await createFundableBottle(token);

    const first = await request(app).post(`/api/bottles/${id}/funding`).set(auth).expect(201);
    expect(first.body.address).toMatch(/^tb1q/);
    expect(first.body.status).toBe("awaiting_funding");
    expect(first.body.bip21).toBe(`bitcoin:${first.body.address}?amount=0.00100000`);

    const again = await request(app).post(`/api/bottles/${id}/funding`).set(auth).expect(200);
    expect(again.body.address).toBe(first.body.address);
    await request(app).get(`/api/bottles/${id}/funding`).set(auth).expect(200);

    const events = await prisma.event.findMany({ where: { bottleId: id, type: "status_changed" } });
    expect(events).toHaveLength(1);

    // Message and key are frozen after funding starts.
    await request(app).put(`/api/bottles/${id}/message`).set(auth)
      .send({ type: "text", objectRef: "inline", ciphertext: "x", encryptionMeta: { alg: "AES-GCM", iv: "aXY=" } }).expect(409);
    await request(app).patch(`/api/bottles/${id}`).set(auth).send({ recipientPubkey: PUBKEY }).expect(409);
  });

  it("will not prepare funding without a key or message", async () => {
    const auth = { Authorization: `Bearer ${await newSession()}` };
    const res = await request(app)
      .post("/api/bottles")
      .set(auth)
      .send({ title: "x", recipientName: "y", amountSats: 50_000, unlockAt: futureIso() })
      .expect(201);
    const funding = await request(app).post(`/api/bottles/${res.body.id}/funding`).set(auth).expect(409);
    expect(funding.body.error).toMatch(/public key/);
    await request(app).patch(`/api/bottles/${res.body.id}`).set(auth).send({ recipientPubkey: PUBKEY }).expect(200);
    const again = await request(app).post(`/api/bottles/${res.body.id}/funding`).set(auth).expect(409);
    expect(again.body.error).toMatch(/message/);
  });
});

describe("recipient access", () => {
  it("issues a high-entropy token and withholds the message until unlockable", async () => {
    const token = await newSession();
    const id = await createFundableBottle(token);
    const issued = await request(app).post(`/api/bottles/${id}/access`).set("Authorization", `Bearer ${token}`).expect(201);
    expect(issued.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.body.url).toContain(`/open/${issued.body.token}`);

    const stored = await prisma.recipientAccess.findFirst({ where: { bottleId: id } });
    expect(stored?.tokenHash).not.toBe(issued.body.token);

    const sealed = await request(app).get(`/api/access/${issued.body.token}`).expect(200);
    expect(sealed.body.message).toBeNull();
    expect(sealed.body.recipientPubkey).toBeUndefined();
    await request(app).post(`/api/access/${issued.body.token}/redeem`).expect(409);

    await prisma.bottle.update({ where: { id }, data: { status: "unlockable" } });
    const open = await request(app).get(`/api/access/${issued.body.token}`).expect(200);
    expect(open.body.message).toMatchObject({ type: "text", ciphertext: "Y2lwaGVy", encryptionMeta: { alg: "AES-GCM" } });
    await request(app).post(`/api/access/${issued.body.token}/redeem`).expect(200);

    const status = await request(app).get(`/api/access/${issued.body.token}/status`).expect(200);
    expect(status.body.status).toBe("unlockable");
  });

  it("returns 404 for unknown or malformed tokens", async () => {
    await request(app).get(`/api/access/${"a".repeat(43)}`).expect(404);
    await request(app).get("/api/access/short").expect(404);
  });
});

describe("lock address uniqueness", () => {
  it("gives two bottles with the same key and unlock time different addresses", async () => {
    const token = await newSession();
    const auth = { Authorization: `Bearer ${token}` };
    const unlockAt = futureIso(30);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(app).post("/api/bottles").set(auth)
        .send({ title: `Twin ${i}`, recipientName: "Ama", amountSats: 10_000, unlockAt, recipientPubkey: PUBKEY }).expect(201);
      await request(app).put(`/api/bottles/${res.body.id}/message`).set(auth)
        .send({ type: "text", objectRef: "inline", ciphertext: "x", encryptionMeta: { alg: "AES-GCM", iv: "aXY=" } }).expect(200);
      ids.push(res.body.id);
    }
    const a = await request(app).post(`/api/bottles/${ids[0]}/funding`).set(auth).expect(201);
    const b = await request(app).post(`/api/bottles/${ids[1]}/funding`).set(auth).expect(201);
    expect(b.body.address).not.toBe(a.body.address);
    expect(b.body.locktime - a.body.locktime).toBe(1);
  });
});
