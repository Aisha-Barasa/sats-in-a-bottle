# End-to-end test checklist (Bitika test key, signet)

Runs the whole product locally against the Bitika **sandbox** and Bitcoin **signet**. No real money moves.

> The Bitika sandbox simulates M-Pesa and Lightning; it does not send real sats. Fund the bottle on-chain
> with signet coins from a faucet. In live mode the same flow uses the real Lightning payout instead.

## 0. Setup

- [ ] Node.js ≥ 20 installed.
- [ ] `cp server/.env.example server/.env` and set:
  - `FUNDING_PROVIDER=bitika`
  - `BITIKA_ENV=test`
  - `BITIKA_API_KEY=bk_test_…` (your sandbox key)
  - `BITCOIN_NETWORK=signet`
- [ ] `cp .env.example .env` (frontend; defaults to `VITE_API_URL=http://localhost:4000`).
- [ ] `npm run setup` (installs both apps and creates the SQLite database `server/dev.db`).
- [ ] `npm run test:server` → all tests pass.
- [ ] `npm run dev:all` → `[api] server listening on :4000 (signet, funding: bitika (test))` and `[web]` Vite on :5173.
- [ ] `curl localhost:4000/health` → `"fundingProvider":{"name":"bitika","env":"test"}`.
- [ ] The API key does not appear anywhere in the terminal output.

## 1. Recipient key

The recipient needs a signet wallet that can show a raw public key and later spend a custom script
(e.g. Sparrow on signet, or `bitcoin-cli -signet getaddressinfo <addr>` → `pubkey`).

- [ ] Copy a compressed public key (66 hex chars starting `02` or `03`).

## 2. Create a bottle

- [ ] Open http://localhost:5173/create.
- [ ] Recipient name, title, recipient public key → Continue. A bad key shows an inline error.
- [ ] Write a message → Continue.
- [ ] Amount (e.g. 10,000 sats) and an unlock date → Continue → **Seal bottle**.
- [ ] Redirected to `/bottle/<id>`; status **Awaiting funding**; a `tb1q…` address and QR are shown.
- [ ] The address matches `GET /api/bottles/<id>/funding` (needs your session token from `localStorage["sib.session"]`).

Tip: to reach the unlock quickly, pick tomorrow's date (bottles unlock at 12:00 local time on that day). Chain time (median time past) runs about an hour behind wall-clock time.

## 3. M-Pesa top-up (Bitika sandbox)

In the bottle's funding panel:

- [ ] Enter KES 500 → **Get quote** → shows sats you'd receive and whether it covers the bottle.
- [ ] Amount below 10 or above 10,000 → validation error.
- [ ] **Success path**: phone `0712345678`, Lightning address (any valid `name@domain`) → **Pay with M-Pesa**.
  - [ ] An `SBX-…` transaction code is shown with status *processing*.
  - [ ] Status moves to *fulfilled* (polled every 4s) with "send them on-chain to the bottle address".
  - [ ] Bottle status is **still Awaiting funding** (Bitika never marks a bottle funded).
- [ ] **Declined path**: phone ending `000001` (e.g. `0700000001`) → ends in *failed*; **Try again** resets the form.
- [ ] **Payout failure path**: phone ending `000002` (e.g. `0700000002`) → ends in *payment_failed* with the Bitika support message.
- [ ] Check stored references: `npm --prefix server run db:studio` → `Event` rows `funding_initiated` /
      `funding_provider_update` carry the `SBX-…` code in `providerRef`; phone is masked; `BitcoinLock.providerRef` is set.

## 4. Webhooks (optional; polling covers it otherwise)

- [ ] Expose the API: `ngrok http 4000` → `https://<id>.ngrok-free.app`.
- [ ] Register `https://<id>.ngrok-free.app/api/webhooks/bitika` with Bitika as described in the
      Webhooks section of https://bitika.xyz/developers/docs (needs your developer login).
- [ ] Put the secret it shows once into `server/.env` as `BITIKA_WEBHOOK_SECRET`, restart `npm run dev:all`.
      The "BITIKA_WEBHOOK_SECRET not set" warning is gone.
- [ ] Repeat a sandbox payment; Bitika's delivery log shows `200` responses and new `funding_provider_update` events appear with source `webhook`.
- [ ] Negative check: `curl -X POST localhost:4000/api/webhooks/bitika -d '{}'` → `401 Invalid signature`.

## 5. Fund on-chain (signet)

- [ ] Get signet coins from a faucet (e.g. https://signetfaucet.com) into a signet wallet.
- [ ] Send at least the bottle amount to the bottle address (or scan the QR / BIP21).
- [ ] Within ~30s the bottle shows **Funded**, with a mempool.space signet link to the transaction.
- [ ] After 1 confirmation (`MIN_CONFIRMATIONS`) it shows **Sealed**.
- [ ] Sending a different amount records a `funding_amount_mismatch` event (still funds the lock).

## 6. Share and unlock

- [ ] On the sender's bottle page, copy the share link. It ends in `#k=…`.
- [ ] Open it in a private window (the recipient). Title, amount and countdown show; **no message** and no funding panel.
- [ ] An edited or truncated link shows "invalid or expired".
- [ ] After the unlock date and chain median time pass it, status becomes **Unlockable** (watcher polls every 30s).
- [ ] Recipient clicks **Open bottle** → message decrypts in the browser and matches what was written.
- [ ] The reveal screen shows the outpoint (txid:vout), witness script and nLockTime needed to claim.
- [ ] The same link without the `#k=` fragment can't decrypt the message.

## 7. Claim

- [ ] In the recipient's wallet, spend the P2WSH output with the witness script, `nLockTime ≥ locktime`
      and `nSequence < 0xffffffff`, signed with the recipient key.
- [ ] Once the spend is seen, the bottle shows **Claimed**.

## 8. Dashboard

- [ ] http://localhost:5173/dashboard lists the bottle with its current status.

## Switching to live (later)

Config only: `BITIKA_ENV=live`, a `bk_live_…` key, `BITCOIN_NETWORK=mainnet`. The server refuses to start if
these don't match.
