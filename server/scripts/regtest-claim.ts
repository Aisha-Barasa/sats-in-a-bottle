// End-to-end check of the CLTV lock and claim against a real Bitcoin Core node (regtest).
//
//   BITCOIN_BIN=/path/to/bitcoin-28.x/bin npm run test:regtest
//
// Starts a throwaway regtest node, locks coins to a bottle address, checks the
// claim is rejected before the unlock time, then moves chain time past it and
// checks the node accepts and mines the claim. Needs bitcoind + bitcoin-cli.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { createCltvLock } from "../src/bitcoin/cltv.js";
import { feeForRate, finalizeClaim, prepareClaim, serviceFeeFor } from "../src/bitcoin/claim.js";

const bin = process.env["BITCOIN_BIN"];
if (!bin) {
  console.error("Set BITCOIN_BIN to the directory containing bitcoind and bitcoin-cli.");
  process.exit(2);
}
const datadir = mkdtempSync(path.join(os.tmpdir(), "sib-regtest-"));
writeFileSync(path.join(datadir, "bitcoin.conf"), "regtest=1\n[regtest]\nrpcport=18543\nport=18544\nfallbackfee=0.0002\ntxindex=1\n");

const run = (args: string[]) => execFileSync(path.join(bin, "bitcoin-cli"), [`-datadir=${datadir}`, ...args]).toString().trim();
const rpc = (...args: string[]) => run(args);
const wallet = (...args: string[]) => run(["-rpcwallet=w", ...args]);
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

const node = spawn(path.join(bin, "bitcoind"), [`-datadir=${datadir}`], { stdio: "ignore" });
try {
  run(["-rpcwait", "-rpcwaittimeout=30", "getblockcount"]);
  rpc("createwallet", "w");
  const miner = wallet("getnewaddress");
  wallet("generatetoaddress", "101", miner);

  const locktime = Math.floor(Date.now() / 1000) + 3600;
  // The gift key, as the sender's browser makes it.
  const priv = randomBytes(32);
  const pubkey = Buffer.from(ecc.pointFromScalar(priv, true)!).toString("hex");
  const lock = createCltvLock({ recipientPubkey: pubkey, locktime, network: "testnet" });

  // bitcoind wants a bcrt1 address; the output script is the same as the tb1 one.
  const lockAddress = bitcoin.address.fromOutputScript(Buffer.from(lock.scriptPubKey, "hex"), bitcoin.networks.regtest);
  const fundTxid = wallet("sendtoaddress", lockAddress, "0.001");
  wallet("generatetoaddress", "1", miner);
  const funded = JSON.parse(wallet("gettransaction", fundTxid, "true", "true")).decoded;
  const vout = funded.vout.findIndex((o: { scriptPubKey: { hex: string } }) => o.scriptPubKey.hex === lock.scriptPubKey);

  const dest = wallet("getnewaddress", "", "bech32");
  const destTb1 = bitcoin.address.fromOutputScript(bitcoin.address.toOutputScript(dest, bitcoin.networks.regtest), bitcoin.networks.testnet);
  // A 1.5% service fee, paid as a second output, as the app's claim flow does.
  const feeWallet = wallet("getnewaddress", "", "bech32");
  const feeTb1 = bitcoin.address.fromOutputScript(bitcoin.address.toOutputScript(feeWallet, bitcoin.networks.regtest), bitcoin.networks.testnet);
  const serviceFee = { address: feeTb1, sats: serviceFeeFor(100_000, 150) };
  const coin = { network: "testnet" as const, witnessScript: lock.witnessScript, txid: fundTxid, vout, valueSats: 100_000, serviceFee };
  const feeSats = feeForRate({ ...coin, address: destTb1 }, 2);
  const { sighash } = prepareClaim({ ...coin, address: destTb1, feeSats });
  const signature = Buffer.from(ecc.sign(Buffer.from(sighash, "hex"), priv)).toString("hex");
  const { txid, hex } = finalizeClaim({ ...coin, address: destTb1, feeSats }, signature);
  const accept = () => JSON.parse(rpc("testmempoolaccept", JSON.stringify([hex])))[0];

  const early = accept();
  check(!early.allowed && early["reject-reason"] === "non-final", `claim before unlock is rejected (${early["reject-reason"]})`);

  // Median time past follows the last 11 block times, so mine 11 blocks after moving the clock.
  rpc("setmocktime", String(locktime + 600));
  for (let i = 0; i < 11; i++) wallet("generatetoaddress", "1", miner);
  const mtp = JSON.parse(rpc("getblockchaininfo")).mediantime as number;
  check(mtp >= locktime, `median time past ${mtp} reached locktime ${locktime}`);

  const late = accept();
  check(Boolean(late.allowed), `claim after unlock is accepted (vsize ${late.vsize})`);
  const sent = rpc("sendrawtransaction", hex);
  wallet("generatetoaddress", "1", miner);
  const mined = JSON.parse(rpc("getrawtransaction", sent, "true"));
  check(sent === txid && mined.confirmations === 1, `claim ${txid.slice(0, 16)}… mined`);
  const receive = 100_000 - feeSats - serviceFee.sats;
  check(Math.round(mined.vout[0].value * 1e8) === receive, `recipient receives ${receive} sats after a ${feeSats}-sat network fee`);
  check(Math.round(mined.vout[1].value * 1e8) === serviceFee.sats, `service fee of ${serviceFee.sats} sats paid as a second output`);
} finally {
  try {
    rpc("stop");
  } catch {
    node.kill();
  }
  await new Promise((resolve) => node.once("exit", resolve));
  rmSync(datadir, { recursive: true, force: true });
}
