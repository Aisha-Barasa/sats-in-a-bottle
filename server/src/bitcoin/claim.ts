import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { bitcoinNetwork, parseCltvScript, type NetworkName } from "./cltv.js";

/**
 * Spending a CLTV lock: the recipient's browser holds the key, the server only
 * builds the transaction and checks the signature. Both steps rebuild the same
 * transaction from the same inputs, so nothing needs to be stored in between.
 */

export class ClaimError extends Error {}

// Below this a P2WPKH/P2TR output is non-standard dust and won't relay.
export const DUST_SATS = 330;
// Non-final so nLockTime (and with it OP_CHECKLOCKTIMEVERIFY) is enforced.
const SEQUENCE = 0xfffffffe;
const SIGHASH = bitcoin.Transaction.SIGHASH_ALL;

export type ClaimInput = {
  network: NetworkName;
  witnessScript: string;
  txid: string;
  vout: number;
  valueSats: number;
  address: string;
  feeSats: number;
  /** Our service fee, paid as a second output. */
  serviceFee?: ServiceFee | null;
};

export type ServiceFee = { address: string; sats: number };

/** Basis points of the bottle's value, or 0 when that would be too small an output to relay. */
export function serviceFeeFor(valueSats: number, bps: number): number {
  const sats = Math.floor((valueSats * bps) / 10_000);
  return sats >= DUST_SATS ? sats : 0;
}

function outputScript(address: string, network: NetworkName): Buffer {
  try {
    return bitcoin.address.toOutputScript(address, bitcoinNetwork(network));
  } catch {
    throw new ClaimError(`Not a valid ${network} Bitcoin address`);
  }
}

function buildTx(input: ClaimInput) {
  const { locktime } = parseCltvScript(input.witnessScript);
  const script = outputScript(input.address, input.network);
  const service = input.serviceFee?.sats ?? 0;
  const value = input.valueSats - input.feeSats - service;
  if (!Number.isInteger(input.feeSats) || input.feeSats <= 0) throw new ClaimError("Fee must be a positive whole number of sats");
  if (value < DUST_SATS) throw new ClaimError("The bottle holds too little to cover the fees");

  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.locktime = locktime;
  tx.addInput(Buffer.from(input.txid, "hex").reverse(), input.vout, SEQUENCE);
  tx.addOutput(script, value);
  if (input.serviceFee && service >= DUST_SATS) tx.addOutput(outputScript(input.serviceFee.address, input.network), service);
  return tx;
}

function sighash(tx: bitcoin.Transaction, input: ClaimInput): Buffer {
  return tx.hashForWitnessV0(0, Buffer.from(input.witnessScript, "hex"), input.valueSats, SIGHASH);
}

/** Virtual size of the signed claim, measured with a worst-case 72-byte DER signature. */
export function claimVsize(input: Omit<ClaimInput, "feeSats">): number {
  const tx = buildTx({ ...input, feeSats: 1 });
  tx.setWitness(0, [Buffer.alloc(73), Buffer.from(input.witnessScript, "hex")]);
  return tx.virtualSize();
}

export function feeForRate(input: Omit<ClaimInput, "feeSats">, satPerVbyte: number): number {
  return Math.ceil(claimVsize(input) * Math.max(1, satPerVbyte));
}

/** What the recipient's browser signs: a 32-byte BIP143 sighash. */
export function prepareClaim(input: ClaimInput) {
  const tx = buildTx(input);
  return { sighash: sighash(tx, input).toString("hex"), receiveSats: tx.outs[0]!.value, serviceFeeSats: input.serviceFee?.sats ?? 0 };
}

/**
 * Checks a 64-byte compact signature (low-S) against the lock's pubkey and
 * returns the fully signed transaction hex, ready to broadcast.
 */
export function finalizeClaim(input: ClaimInput, signatureHex: string): { txid: string; hex: string } {
  const tx = buildTx(input);
  const hash = sighash(tx, input);
  const { recipientPubkey } = parseCltvScript(input.witnessScript);
  const signature = Buffer.from(signatureHex, "hex");
  if (signature.length !== 64 || signatureHex.length !== 128) throw new ClaimError("Signature must be 64 bytes (compact)");
  // strict = true also rejects high-S signatures, which nodes won't relay.
  if (!ecc.verify(hash, Buffer.from(recipientPubkey, "hex"), signature, true)) {
    throw new ClaimError("Signature does not match this bottle's key");
  }
  tx.setWitness(0, [bitcoin.script.signature.encode(signature, SIGHASH), Buffer.from(input.witnessScript, "hex")]);
  return { txid: tx.getId(), hex: tx.toHex() };
}
