import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { runWatcherOnce } from "../src/chain/watcher.js";
import { createFundableBottle, FakeChain, newSession, PUBKEY } from "./helpers.js";

const PRIV = Buffer.alloc(32);
PRIV[31] = 1;
const ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(PUBKEY, "hex"), network: bitcoin.networks.testnet }).address!;
const sign = (sighash: string) => Buffer.from(ecc.sign(Buffer.from(sighash, "hex"), PRIV)).toString("hex");

let chain: FakeChain;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  chain = new FakeChain();
  app = createApp({ fundingProvider: null, chain });
});

/** A bottle funded and confirmed on the fake chain, plus the recipient's access token. */
async function sealedBottle() {
  const token = await newSession();
  const auth = { Authorization: `Bearer ${token}` };
  const id = await createFundableBottle(token);
  const funding = await request(app).post(`/api/bottles/${id}/funding`).set(auth).expect(201);
  chain.txs.set(funding.body.address, [
    { txid: "cd".repeat(32), status: { confirmed: true, block_height: 100 }, vout: [{ scriptpubkey_address: funding.body.address, value: 100_000 }] },
  ]);
  chain.mtp = funding.body.locktime - 10;
  await runWatcherOnce(chain);
  const access = await request(app).post(`/api/bottles/${id}/access`).set(auth).expect(201);
  return { id, auth, accessToken: access.body.token as string, locktime: funding.body.locktime as number };
}

describe("recipient claim", () => {
  it("prepares, accepts a valid signature and broadcasts the signed spend", async () => {
    const { id, accessToken, locktime } = await sealedBottle();
    await request(app).post(`/api/access/${accessToken}/claim/prepare`).send({ address: ADDRESS }).expect(409);

    chain.mtp = locktime;
    await runWatcherOnce(chain);
    expect((await prisma.bottle.findUniqueOrThrow({ where: { id } })).status).toBe("unlockable");

    const prep = await request(app).post(`/api/access/${accessToken}/claim/prepare`).send({ address: ADDRESS }).expect(200);
    expect(prep.body).toMatchObject({ address: ADDRESS, network: "signet", valueSats: 100_000, feeRate: 3 });
    expect(prep.body.receiveSats).toBe(100_000 - prep.body.feeSats);

    const res = await request(app)
      .post(`/api/access/${accessToken}/claim`)
      .send({ address: ADDRESS, feeSats: prep.body.feeSats, signature: sign(prep.body.sighash) })
      .expect(201);
    expect(res.body.txid).toBe("b".repeat(64));
    expect(chain.broadcasts).toHaveLength(1);
    const tx = bitcoin.Transaction.fromHex(chain.broadcasts[0]!);
    expect(tx.locktime).toBe(locktime);
    expect(tx.outs[0]!.value).toBe(prep.body.receiveSats);
    expect(await prisma.event.count({ where: { bottleId: id, type: "claim_broadcast" } })).toBe(1);

    // The watcher, not the claim call, marks it claimed once the spend is seen.
    chain.spent.add(`${"cd".repeat(32)}:0`);
    await runWatcherOnce(chain);
    expect((await prisma.bottle.findUniqueOrThrow({ where: { id } })).status).toBe("claimed");
    await request(app).post(`/api/access/${accessToken}/claim/prepare`).send({ address: ADDRESS }).expect(409);
  });

  it("rejects bad signatures, tampered fees and wrong-network addresses before broadcasting", async () => {
    const { accessToken, locktime } = await sealedBottle();
    chain.mtp = locktime;
    await runWatcherOnce(chain);
    const prep = await request(app).post(`/api/access/${accessToken}/claim/prepare`).send({ address: ADDRESS }).expect(200);
    const claim = (body: object) => request(app).post(`/api/access/${accessToken}/claim`).send(body);

    await claim({ address: ADDRESS, feeSats: prep.body.feeSats, signature: "ab".repeat(64) }).expect(400);
    await claim({ address: ADDRESS, feeSats: prep.body.feeSats + 1, signature: sign(prep.body.sighash) }).expect(400);
    await claim({ address: ADDRESS, feeSats: 60_000, signature: sign(prep.body.sighash) }).expect(400);
    const mainnet = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(PUBKEY, "hex") }).address!;
    await request(app).post(`/api/access/${accessToken}/claim/prepare`).send({ address: mainnet }).expect(400);
    expect(chain.broadcasts).toHaveLength(0);
  });

  it("reports the node's rejection reason as a 502", async () => {
    const { accessToken, locktime } = await sealedBottle();
    chain.mtp = locktime;
    await runWatcherOnce(chain);
    const prep = await request(app).post(`/api/access/${accessToken}/claim/prepare`).send({ address: ADDRESS }).expect(200);
    chain.rejectWith = "non-final";
    const res = await request(app)
      .post(`/api/access/${accessToken}/claim`)
      .send({ address: ADDRESS, feeSats: prep.body.feeSats, signature: sign(prep.body.sighash) })
      .expect(502);
    expect(res.body.error).toContain("non-final");
  });

  it("returns 503 when the server has no chain client", async () => {
    const { accessToken, locktime } = await sealedBottle();
    chain.mtp = locktime;
    await runWatcherOnce(chain);
    const noChain = createApp({ fundingProvider: null, chain: null });
    await request(noChain).post(`/api/access/${accessToken}/claim/prepare`).send({ address: ADDRESS }).expect(503);
  });
});
