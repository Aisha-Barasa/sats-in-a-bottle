import { createHash } from "node:crypto";
import { bech32 } from "bech32";
import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { PubkeyError, buildCltvScript, createCltvLock, parseCltvScript, parseRecipientPubkey } from "../src/bitcoin/cltv.js";
import { LocktimeError } from "../src/bitcoin/locktime.js";

// secp256k1 generator point G, compressed.
const PUBKEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const LOCKTIME = 1_908_014_400; // 2030-06-18T12:00:00Z = 0x71b9fd40

describe("CLTV script construction", () => {
  it("builds <locktime> CLTV DROP <pubkey> CHECKSIG with a minimal little-endian push", () => {
    const script = buildCltvScript(parseRecipientPubkey(PUBKEY), LOCKTIME);
    // 04 40fdb971 | b1 | 75 | 21 <33-byte pubkey> | ac
    expect(script.toString("hex")).toBe(`0440fdb971b17521${PUBKEY}ac`);
    expect(bitcoin.script.toASM(script)).toBe(`40fdb971 OP_CHECKLOCKTIMEVERIFY OP_DROP ${PUBKEY} OP_CHECKSIG`);
  });

  it("uses a 5-byte push when the high bit of the 4th byte is set", () => {
    // 0x80000000 needs a sign byte: 00000080 00
    const script = buildCltvScript(parseRecipientPubkey(PUBKEY), 0x8000_0000);
    expect(script.subarray(0, 6).toString("hex")).toBe("050000008000");
    expect(parseCltvScript(script.toString("hex")).locktime).toBe(0x8000_0000);
  });

  it("derives the P2WSH address as bech32(v0, sha256(witnessScript))", () => {
    const lock = createCltvLock({ recipientPubkey: PUBKEY, locktime: LOCKTIME, network: "signet" });
    const program = createHash("sha256").update(Buffer.from(lock.witnessScript, "hex")).digest();
    const expected = bech32.encode("tb", [0, ...bech32.toWords(program)]);
    expect(lock.address).toBe(expected);
    expect(lock.scriptPubKey).toBe(`0020${program.toString("hex")}`);
    expect(lock.address.startsWith("tb1q")).toBe(true);
    expect(lock.address).toHaveLength(62);
  });

  it("encodes mainnet addresses with bc1", () => {
    const lock = createCltvLock({ recipientPubkey: PUBKEY, locktime: LOCKTIME, network: "mainnet" });
    expect(lock.address.startsWith("bc1q")).toBe(true);
  });

  it("is deterministic and changes with locktime or key", () => {
    const a = createCltvLock({ recipientPubkey: PUBKEY, locktime: LOCKTIME, network: "signet" });
    const b = createCltvLock({ recipientPubkey: PUBKEY, locktime: LOCKTIME, network: "signet" });
    const c = createCltvLock({ recipientPubkey: PUBKEY, locktime: LOCKTIME + 1, network: "signet" });
    expect(a.address).toBe(b.address);
    expect(c.address).not.toBe(a.address);
  });

  it("round-trips through parseCltvScript", () => {
    const lock = createCltvLock({ recipientPubkey: PUBKEY, locktime: LOCKTIME, network: "signet" });
    expect(parseCltvScript(lock.witnessScript)).toEqual({ locktime: LOCKTIME, recipientPubkey: PUBKEY });
    expect(() => parseCltvScript("51")).toThrow();
  });

  it("rejects invalid keys and block-height locktimes", () => {
    expect(() => parseRecipientPubkey(`04${PUBKEY.slice(2)}`)).toThrow(PubkeyError); // wrong prefix
    expect(() => parseRecipientPubkey(PUBKEY.slice(0, 64))).toThrow(PubkeyError); // too short
    expect(() => parseRecipientPubkey(`02${"ff".repeat(32)}`)).toThrow(PubkeyError); // x not on curve
    expect(() => buildCltvScript(parseRecipientPubkey(PUBKEY), 850_000)).toThrow(LocktimeError);
  });
});
