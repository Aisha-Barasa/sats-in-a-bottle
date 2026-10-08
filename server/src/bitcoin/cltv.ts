import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { LOCKTIME_THRESHOLD, LocktimeError, MAX_LOCKTIME } from "./locktime.js";

export type NetworkName = "signet" | "testnet" | "mainnet";

// Signet and testnet share address encoding (tb1...).
export function bitcoinNetwork(name: NetworkName): bitcoin.Network {
  return name === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

export class PubkeyError extends Error {
  override name = "PubkeyError";
}

/** Requires a compressed secp256k1 point, as segwit v0 does for standardness. */
export function parseRecipientPubkey(hex: string): Buffer {
  if (!/^0[23][0-9a-fA-F]{64}$/.test(hex)) {
    throw new PubkeyError("Recipient key must be a 33-byte compressed public key in hex (02… or 03…)");
  }
  const pubkey = Buffer.from(hex, "hex");
  if (!ecc.isPoint(pubkey)) throw new PubkeyError("Recipient key is not a valid secp256k1 point");
  return pubkey;
}

/**
 * <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <recipientPubkey> OP_CHECKSIG
 *
 * Only the recipient can ever spend this, and only once the locktime has passed.
 * There is no sender recovery path.
 */
export function buildCltvScript(recipientPubkey: Buffer, locktime: number): Buffer {
  if (!Number.isInteger(locktime) || locktime < LOCKTIME_THRESHOLD || locktime > MAX_LOCKTIME) {
    throw new LocktimeError(`Not a timestamp locktime: ${locktime}`);
  }
  return bitcoin.script.compile([
    bitcoin.script.number.encode(locktime),
    bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY!,
    bitcoin.opcodes.OP_DROP!,
    recipientPubkey,
    bitcoin.opcodes.OP_CHECKSIG!,
  ]);
}

export type CltvLock = {
  address: string;
  witnessScript: string; // hex
  scriptPubKey: string; // hex
  locktime: number;
  recipientPubkey: string;
  network: NetworkName;
};

export function createCltvLock(params: {
  recipientPubkey: string;
  locktime: number;
  network: NetworkName;
}): CltvLock {
  const pubkey = parseRecipientPubkey(params.recipientPubkey);
  const witnessScript = buildCltvScript(pubkey, params.locktime);
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: { output: witnessScript },
    network: bitcoinNetwork(params.network),
  });
  if (!p2wsh.address || !p2wsh.output) throw new Error("Failed to derive P2WSH address");
  return {
    address: p2wsh.address,
    witnessScript: witnessScript.toString("hex"),
    scriptPubKey: p2wsh.output.toString("hex"),
    locktime: params.locktime,
    recipientPubkey: pubkey.toString("hex"),
    network: params.network,
  };
}

/** Parses a witness script built by buildCltvScript; throws on anything else. */
export function parseCltvScript(witnessScriptHex: string): { locktime: number; recipientPubkey: string } {
  const chunks = bitcoin.script.decompile(Buffer.from(witnessScriptHex, "hex"));
  const [lt, cltv, drop, pubkey, checksig] = chunks ?? [];
  if (
    chunks?.length !== 5 ||
    !Buffer.isBuffer(lt) ||
    cltv !== bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY ||
    drop !== bitcoin.opcodes.OP_DROP ||
    !Buffer.isBuffer(pubkey) ||
    checksig !== bitcoin.opcodes.OP_CHECKSIG
  ) {
    throw new Error("Not a Sats in a Bottle CLTV script");
  }
  return { locktime: bitcoin.script.number.decode(lt, 5), recipientPubkey: pubkey.toString("hex") };
}
