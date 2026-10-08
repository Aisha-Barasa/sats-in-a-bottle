import type { BitcoinLock, Bottle } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { isLocktimeReached } from "../bitcoin/locktime.js";
import { transitionBottle, type BottleStatus } from "../domain/bottleStateMachine.js";
import type { ChainClient } from "./mempool.js";

const WATCHED: BottleStatus[] = ["awaiting_funding", "funded", "sealed", "unlockable"];

type ChainSnapshot = { tipHeight: number; medianTimePast: number };

/**
 * Advances one bottle as far as chain data allows, one legal step at a time:
 * awaiting_funding -> funded (tx seen) -> sealed (MIN_CONFIRMATIONS) ->
 * unlockable (MTP >= locktime) -> claimed (lock output spent).
 */
export async function checkBottle(
  bottle: Bottle & { lock: BitcoinLock },
  chain: ChainClient,
  snapshot: ChainSnapshot,
): Promise<BottleStatus> {
  let status = bottle.status as BottleStatus;
  let lock = bottle.lock;

  if (status === "awaiting_funding" || status === "funded") {
    const txs = await chain.getAddressTxs(lock.address);
    const funding = findFunding(txs, lock.address, lock.txid);
    if (funding) {
      const confirmations = funding.blockHeight ? snapshot.tipHeight - funding.blockHeight + 1 : 0;
      lock = await prisma.bitcoinLock.update({
        where: { id: lock.id },
        data: { txid: funding.txid, vout: funding.vout, amountSats: funding.value, confirmations },
      });
      if (status === "awaiting_funding") {
        if (funding.value !== bottle.amountSats) {
          await prisma.event.create({
            data: {
              bottleId: bottle.id,
              type: "funding_amount_mismatch",
              metadata: JSON.stringify({ expected: bottle.amountSats, received: funding.value, txid: funding.txid }),
            },
          });
        }
        if (await transitionBottle(prisma, bottle.id, "awaiting_funding", "funded", { metadata: { txid: funding.txid, vout: funding.vout, amountSats: funding.value } })) {
          status = "funded";
        }
      }
      if (status === "funded" && confirmations >= config.MIN_CONFIRMATIONS) {
        if (await transitionBottle(prisma, bottle.id, "funded", "sealed", { metadata: { confirmations } })) status = "sealed";
      }
    }
  } else if (lock.txid) {
    const height = await confirmationsFor(chain, lock);
    if (height !== null) {
      await prisma.bitcoinLock.update({ where: { id: lock.id }, data: { confirmations: snapshot.tipHeight - height + 1 } });
    }
  }

  if (status === "sealed" && isLocktimeReached(lock.locktime, snapshot.medianTimePast)) {
    if (await transitionBottle(prisma, bottle.id, "sealed", "unlockable", { metadata: { medianTimePast: snapshot.medianTimePast } })) {
      status = "unlockable";
    }
  }

  if (status === "unlockable" && lock.txid && lock.vout !== null) {
    if (await chain.isOutputSpent(lock.txid, lock.vout)) {
      if (await transitionBottle(prisma, bottle.id, "unlockable", "claimed")) status = "claimed";
    }
  }
  return status;
}

function findFunding(txs: Awaited<ReturnType<ChainClient["getAddressTxs"]>>, address: string, knownTxid: string | null) {
  const candidates = txs.flatMap((tx) =>
    tx.vout
      .map((out, vout) => ({ txid: tx.txid, vout, value: out.value, address: out.scriptpubkey_address, blockHeight: tx.status.block_height }))
      .filter((o) => o.address === address),
  );
  // Stick with the first funding output once chosen; otherwise take the largest.
  return candidates.find((c) => c.txid === knownTxid) ?? candidates.sort((a, b) => b.value - a.value)[0];
}

async function confirmationsFor(chain: ChainClient, lock: BitcoinLock): Promise<number | null> {
  const tx = (await chain.getAddressTxs(lock.address)).find((t) => t.txid === lock.txid);
  return tx?.status.block_height ?? null;
}

export async function runWatcherOnce(chain: ChainClient): Promise<void> {
  const bottles = await prisma.bottle.findMany({
    where: { status: { in: WATCHED }, lock: { isNot: null } },
    include: { lock: true },
    take: 200,
    orderBy: { updatedAt: "asc" },
  });
  if (bottles.length === 0) return;
  const snapshot = { tipHeight: await chain.getTipHeight(), medianTimePast: await chain.getMedianTimePast() };
  for (const bottle of bottles) {
    try {
      await checkBottle(bottle as Bottle & { lock: BitcoinLock }, chain, snapshot);
    } catch (err) {
      console.error(`watcher: bottle ${bottle.id} check failed:`, err instanceof Error ? err.message : err);
    }
  }
}

export function startWatcher(chain: ChainClient, intervalMs = config.WATCHER_INTERVAL_MS): () => void {
  if (intervalMs <= 0) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runWatcherOnce(chain);
    } catch (err) {
      console.error("watcher: tick failed:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
