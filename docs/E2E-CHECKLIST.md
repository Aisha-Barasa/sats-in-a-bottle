# End-to-end test checklist (Bitika test key, signet)

The automated suites cover the logic: `npm test` (server), `npm run test:e2e` (browser, demo mode) and
`npm --prefix server run test:regtest` (claim on a real Bitcoin node). This checklist covers what they can't:
the real Bitika sandbox, real signet coins and a real claim. No real money moves.

> The Bitika sandbox simulates M-Pesa and Lightning and sends no real sats. Fund the bottle on-chain with signet
> coins from a faucet. In live mode the same flow uses the real Lightning payout.

## 0. Setup

- [ ] Node.js 20.19 or newer.
- [ ] `cp server/.env.example server/.env` and set:
  - `FUNDING_PROVIDER=bitika`, `BITIKA_ENV=test`, `BITIKA_API_KEY=bk_test_…` (your sandbox key)
  - `BITCOIN_NETWORK=signet`
  - `DEV_TOOLS=false` (this run uses the real chain)
- [ ] `npm run setup` installs both apps and creates `server/dev.db`.
- [ ] `npm test` and `npm run lint` pass.
- [ ] `npm run dev` shows `[api] server listening on :4000 (signet, funding: bitika (test))` and `[web]` on :5173.
- [ ] `curl localhost:5173/api/health` shows `"fundingProvider":{"name":"bitika","env":"test"}`.
- [ ] The API key does not appear anywhere in the terminal output.

## 1. Create a bottle

- [ ] Open http://localhost:5173 and click **Create a bottle**.
- [ ] Their name and your name, then Continue. (Leave "They already have a Bitcoin wallet" closed to use a gift key.)
- [ ] Write a letter; optionally record a voice note and add a photo.
- [ ] Pick an occasion and a date. For a quick run, set it about an hour ahead.
- [ ] Amount in shillings: KES 500 shows a live Bitika rate in sats. Below 10 or above 10,000 is refused.
- [ ] Tick the confirmation and **Seal bottle**. You land on `/b/<id>` with status **Awaiting funds**.

## 2. M-Pesa top-up (Bitika sandbox)

On the bottle page, **M-Pesa** tab:

- [ ] **Get quote** shows sats and whether they cover the bottle.
- [ ] Success: phone `0712345678`, any Lightning address (`name@domain`), **Send M-Pesa prompt**.
  - [ ] An `SBX-…` code appears, then *fulfilled* with "Now send from your Lightning wallet to" the bottle address.
  - [ ] The bottle is **still Awaiting funds**. Only an on-chain payment funds it.
- [ ] Declined: a phone ending `000001` (`0700000001`) ends in *failed*; **Try again** resets the form.
- [ ] Payout failure: a phone ending `000002` (`0700000002`) ends in *payment_failed* with the support message.
- [ ] `npm --prefix server run db:studio`: `Event` rows carry the `SBX-…` code in `providerRef`, the phone is masked,
      and `BitcoinLock.providerRef` is set.

## 3. Webhooks (optional; polling covers it)

- [ ] `ngrok http 4000`, then register `https://<id>.ngrok-free.app/api/webhooks/bitika` as described in the
      Webhooks section of https://bitika.xyz/developers/docs.
- [ ] Put the secret it shows once into `server/.env` as `BITIKA_WEBHOOK_SECRET` and restart. The warning is gone.
- [ ] A new sandbox payment adds `funding_provider_update` events with source `webhook`.
- [ ] `curl -X POST localhost:4000/api/webhooks/bitika -d '{}'` returns `401 Invalid signature`.

## 4. Fund on-chain (signet)

- [ ] Get signet coins from a faucet (for example https://signetfaucet.com) into a signet wallet.
- [ ] **Bitcoin wallet** tab: scan the QR or copy the address and send the bottle amount.
- [ ] Within about 30 seconds the bottle shows **Funded** with a mempool.space link.
- [ ] After one confirmation it shows **Sealed** with a countdown and the share panel.
- [ ] **Verify it yourself** shows the address, locktime and witness script.

## 5. Share and wait

- [ ] Copy the share link. It ends in `#k=…&g=…`.
- [ ] Open it in a private window (the recipient): from your name, the countdown and amount; no message.
- [ ] **Find a bottle** with the pasted link reaches the same page.
- [ ] The link without its `#…` part says the key is missing. An edited token says "Link not found".
- [ ] When the countdown reaches zero, the page explains Bitcoin's clock lag, then shows **Ready** once median
      time past passes the locktime (the watcher checks every 30 seconds).

## 6. Open and claim

- [ ] **Open the bottle**: the letter, photo and voice note appear and match what was sent.
- [ ] **Claim your sats**: paste a signet address you own (`tb1…`), check the amount after the network fee, tick
      the box, **Claim sats**.
- [ ] A transaction id appears with a mempool.space link, and the wallet receives the sats once it confirms.
- [ ] The sender's page then shows **Claimed**, and a second claim attempt is refused.

## 7. Dashboards

- [ ] http://localhost:5173/home lists the bottle under My bottles with the sats locked total.
- [ ] In the recipient's window, **Bottles → Received** lists it.

## Switching to live (later)

Config only: `BITIKA_ENV=live`, a `bk_live_…` key, `BITCOIN_NETWORK=mainnet`. The server refuses to start if
these don't match, or if `DEV_TOOLS=true` on mainnet.
