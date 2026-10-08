import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, createFundableBottle, newSession } from "./helpers.js";
import { prisma } from "../src/db.js";
import { runWatcherOnce } from "../src/chain/watcher.js";
import type { AddressTx, ChainClient } from "../src/chain/mempool.js";

class FakeChain implements ChainClient {
  txs = new Map<string, AddressTx[]>();
  tip = 100;
  mtp = 0;
  spent = new Set<string>();
  async getAddressTxs(address: string) { return this.txs.get(address) ?? []; }
  async getTipHeight() { return this.tip; }
  async getMedianTimePast() { return this.mtp; }
  async isOutputSpent(txid: string, vout: number) { return this.spent.has(`${txid}:${vout}`); }
}

async function fundedSetup(amount = 100_000) {
  const token = await newSession();
  const id = await createFundableBottle(token);
  const funding = await request(app).post(`/api/bottles/${id}/funding`).set("Authorization", `Bearer ${token}`).expect(201);
  const chain = new FakeChain();
  chain.mtp = Math.floor(Date.now() / 1000);
  const tx: AddressTx = {
    txid: "aa".repeat(32),
    status: { confirmed: false },
    vout: [{ scriptpubkey_address: "tb1qchange", value: 5_000 }, { scriptpubkey_address: funding.body.address, value: amount }],
  };
  chain.txs.set(funding.body.address, [tx]);
  return { id, chain, tx, locktime: funding.body.locktime as number };
}

const statusOf = async (id: string) => (await prisma.bottle.findUniqueOrThrow({ where: { id } })).status;

describe("chain watcher", () => {
  it("walks awaiting_funding -> funded -> sealed -> unlockable -> claimed", async () => {
    const { id, chain, tx, locktime } = await fundedSetup();

    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("funded");
    const lock = await prisma.bitcoinLock.findUniqueOrThrow({ where: { bottleId: id } });
    expect(lock).toMatchObject({ txid: tx.txid, vout: 1, amountSats: 100_000, confirmations: 0 });

    tx.status = { confirmed: true, block_height: 100 };
    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("sealed");

    chain.mtp = locktime - 1;
    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("sealed");

    chain.mtp = locktime;
    chain.tip = 105;
    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("unlockable");
    expect((await prisma.bitcoinLock.findUniqueOrThrow({ where: { bottleId: id } })).confirmations).toBe(6);

    chain.spent.add(`${tx.txid}:1`);
    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("claimed");

    const transitions = await prisma.event.findMany({ where: { bottleId: id, type: "status_changed" }, orderBy: { createdAt: "asc" } });
    expect(transitions.map((e) => JSON.parse(e.metadata).to)).toEqual(["awaiting_funding", "funded", "sealed", "unlockable", "claimed"]);
  });

  it("goes straight to sealed when the funding tx is already confirmed", async () => {
    const { id, chain, tx } = await fundedSetup();
    tx.status = { confirmed: true, block_height: 99 };
    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("sealed");
  });

  it("records the real amount and a mismatch event when underfunded", async () => {
    const { id, chain } = await fundedSetup(60_000);
    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("funded");
    expect((await prisma.bitcoinLock.findUniqueOrThrow({ where: { bottleId: id } })).amountSats).toBe(60_000);
    expect(await prisma.event.count({ where: { bottleId: id, type: "funding_amount_mismatch" } })).toBe(1);
  });

  it("leaves bottles alone when nothing is on chain", async () => {
    const { id, chain } = await fundedSetup();
    chain.txs.clear();
    await runWatcherOnce(chain);
    expect(await statusOf(id)).toBe("awaiting_funding");
  });
});
