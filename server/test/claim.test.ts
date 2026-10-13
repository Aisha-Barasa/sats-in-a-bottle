import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { describe, expect, it } from "vitest";
import { createCltvLock } from "../src/bitcoin/cltv.js";
import { ClaimError, claimVsize, feeForRate, finalizeClaim, prepareClaim, type ClaimInput } from "../src/bitcoin/claim.js";
import { PUBKEY } from "./helpers.js";

// PUBKEY is the generator point, i.e. the public key of private key 1.
const PRIV = Buffer.alloc(32);
PRIV[31] = 1;
const LOCKTIME = 1_908_014_400;
const lock = createCltvLock({ recipientPubkey: PUBKEY, locktime: LOCKTIME, network: "signet" });
const ADDRESS = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(PUBKEY, "hex"), network: bitcoin.networks.testnet }).address!;

const coin: Omit<ClaimInput, "feeSats" | "address"> = {
  network: "signet",
  witnessScript: lock.witnessScript,
  txid: "aa".repeat(32),
  vout: 1,
  valueSats: 100_000,
};
const input: ClaimInput = { ...coin, address: ADDRESS, feeSats: 500 };

const sign = (sighashHex: string, key = PRIV) => Buffer.from(ecc.sign(Buffer.from(sighashHex, "hex"), key)).toString("hex");

describe("CLTV claim transaction", () => {
  it("builds a spend the lock's key can sign, with nLockTime and a non-final sequence", () => {
    const { sighash, receiveSats } = prepareClaim(input);
    expect(receiveSats).toBe(99_500);

    const { txid, hex } = finalizeClaim(input, sign(sighash));
    const tx = bitcoin.Transaction.fromHex(hex);
    expect(tx.getId()).toBe(txid);
    expect(tx.locktime).toBe(LOCKTIME);
    expect(tx.ins[0]!.sequence).toBe(0xfffffffe);
    expect(Buffer.from(tx.ins[0]!.hash).reverse().toString("hex")).toBe(coin.txid);
    expect(tx.outs[0]!.value).toBe(99_500);
    expect(bitcoin.address.fromOutputScript(tx.outs[0]!.script, bitcoin.networks.testnet)).toBe(ADDRESS);

    // Witness is [DER sig + SIGHASH_ALL, witnessScript] and the sig verifies against the BIP143 hash.
    const [sigItem, scriptItem] = tx.ins[0]!.witness;
    expect(scriptItem!.toString("hex")).toBe(lock.witnessScript);
    const decoded = bitcoin.script.signature.decode(sigItem!);
    expect(decoded.hashType).toBe(bitcoin.Transaction.SIGHASH_ALL);
    const hash = tx.hashForWitnessV0(0, scriptItem!, coin.valueSats, bitcoin.Transaction.SIGHASH_ALL);
    expect(ecc.verify(hash, Buffer.from(PUBKEY, "hex"), decoded.signature)).toBe(true);
  });

  it("is deterministic, so prepare and finalize agree without storing anything", () => {
    expect(prepareClaim(input).sighash).toBe(prepareClaim({ ...input }).sighash);
    expect(prepareClaim({ ...input, feeSats: 501 }).sighash).not.toBe(prepareClaim(input).sighash);
  });

  it("rejects a signature from another key, a high-S signature and malformed input", () => {
    const { sighash } = prepareClaim(input);
    const other = Buffer.alloc(32, 7);
    expect(() => finalizeClaim(input, sign(sighash, other))).toThrow(ClaimError);
    // Signing a different fee's sighash is the same as a wrong signature here.
    expect(() => finalizeClaim({ ...input, feeSats: 600 }, sign(sighash))).toThrow(/does not match/);

    const sig = Buffer.from(sign(sighash), "hex");
    const n = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    const s = BigInt(`0x${sig.subarray(32).toString("hex")}`);
    const highS = Buffer.concat([sig.subarray(0, 32), Buffer.from((n - s).toString(16).padStart(64, "0"), "hex")]);
    expect(() => finalizeClaim(input, highS.toString("hex"))).toThrow(ClaimError);

    expect(() => finalizeClaim(input, "00")).toThrow(/64 bytes/);
  });

  it("refuses addresses from another network and outputs below dust", () => {
    const mainnet = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(PUBKEY, "hex") }).address!;
    expect(() => prepareClaim({ ...input, address: mainnet })).toThrow(/signet/);
    expect(() => prepareClaim({ ...input, address: "not-an-address" })).toThrow(ClaimError);
    expect(() => prepareClaim({ ...input, feeSats: 99_800 })).toThrow(/too little/);
    expect(() => prepareClaim({ ...input, feeSats: 0 })).toThrow(/positive/);
  });

  it("sizes the fee from the signed transaction's vsize", () => {
    const vsize = claimVsize({ ...coin, address: ADDRESS });
    // 82 non-witness bytes * 4 + 120 witness bytes (sig, 42-byte script) = 448 WU = 112 vB.
    expect(vsize).toBe(112);
    expect(feeForRate({ ...coin, address: ADDRESS }, 2)).toBe(Math.ceil(vsize * 2));
    expect(feeForRate({ ...coin, address: ADDRESS }, 0)).toBe(Math.ceil(vsize));
  });
});
