import type { BitcoinLock, Bottle, Message } from "@prisma/client";

type BottleWithRelations = Bottle & { lock?: BitcoinLock | null; message?: Message | null };

export function lockView(lock: BitcoinLock) {
  return {
    network: lock.network,
    address: lock.address,
    locktime: lock.locktime,
    witnessScript: lock.witnessScript,
    txid: lock.txid,
    vout: lock.vout,
    amountSats: lock.amountSats,
    confirmations: lock.confirmations,
    fundingProvider: lock.fundingProvider,
    providerRef: lock.providerRef,
  };
}

export function messageView(message: Message) {
  return {
    type: message.type,
    objectRef: message.objectRef,
    ciphertext: message.ciphertext,
    encryptionMeta: JSON.parse(message.encryptionMeta) as unknown,
  };
}

/** Owner view: everything except secrets (there are none server-side to leak). */
export function bottleView(bottle: BottleWithRelations) {
  return {
    id: bottle.id,
    title: bottle.title,
    recipientName: bottle.recipientName,
    recipientPubkey: bottle.recipientPubkey,
    senderName: bottle.senderName,
    occasion: bottle.occasion,
    status: bottle.status,
    amountSats: bottle.amountSats,
    serviceFeeBps: bottle.serviceFeeBps,
    unlockAt: bottle.unlockAt.toISOString(),
    network: bottle.network,
    createdAt: bottle.createdAt.toISOString(),
    updatedAt: bottle.updatedAt.toISOString(),
    hasMessage: Boolean(bottle.message),
    lock: bottle.lock ? lockView(bottle.lock) : null,
  };
}

const REVEALED = new Set(["unlockable", "claimed"]);

/** Recipient view: the encrypted message is withheld until the bottle is unlockable. */
export function recipientView(bottle: BottleWithRelations) {
  const { recipientPubkey: _pk, ...rest } = bottleView(bottle);
  return {
    ...rest,
    message: REVEALED.has(bottle.status) && bottle.message ? messageView(bottle.message) : null,
  };
}

export function statusView(bottle: BottleWithRelations) {
  return {
    id: bottle.id,
    status: bottle.status,
    unlockAt: bottle.unlockAt.toISOString(),
    txid: bottle.lock?.txid ?? null,
    confirmations: bottle.lock?.confirmations ?? 0,
    updatedAt: bottle.updatedAt.toISOString(),
  };
}
