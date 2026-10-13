import request from "supertest";
import { createApp } from "../src/app.js";
import { BroadcastError, type AddressTx, type ChainClient } from "../src/chain/mempool.js";

export const app = createApp();
export const PUBKEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

export async function newSession(): Promise<string> {
  const res = await request(app).post("/api/session").send({ displayName: "Tester" }).expect(201);
  return res.body.token as string;
}

export function futureIso(days = 365): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function createFundableBottle(token: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  const created = await request(app)
    .post("/api/bottles")
    .set(auth)
    .send({ title: "For Ama", recipientName: "Ama", amountSats: 100_000, unlockAt: futureIso(), recipientPubkey: PUBKEY })
    .expect(201);
  const id = created.body.id as string;
  await request(app)
    .put(`/api/bottles/${id}/message`)
    .set(auth)
    .send({ type: "text", objectRef: "inline", ciphertext: "Y2lwaGVy", encryptionMeta: { alg: "AES-GCM", iv: "aXY=" } })
    .expect(200);
  return id;
}

/** In-memory chain for watcher and claim tests. */
export class FakeChain implements ChainClient {
  txs = new Map<string, AddressTx[]>();
  tip = 100;
  mtp = 0;
  spent = new Set<string>();
  feeRate = 3;
  broadcasts: string[] = [];
  rejectWith: string | null = null;
  async getAddressTxs(address: string) { return this.txs.get(address) ?? []; }
  async getTipHeight() { return this.tip; }
  async getMedianTimePast() { return this.mtp; }
  async isOutputSpent(txid: string, vout: number) { return this.spent.has(`${txid}:${vout}`); }
  async getFeeRate() { return this.feeRate; }
  async broadcast(hex: string) {
    if (this.rejectWith) throw new BroadcastError(this.rejectWith);
    this.broadcasts.push(hex);
    return "b".repeat(64);
  }
}
