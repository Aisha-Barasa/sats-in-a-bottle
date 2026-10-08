import request from "supertest";
import { createApp } from "../src/app.js";

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
