# Sats in a Bottle API

Express + TypeScript server in `/server`. Base URL in development: `http://localhost:4000`.
The web app reaches it through the Vite proxy at `http://localhost:5173/api`.

All request and response bodies are JSON. Errors look like:

```json
{ "error": "Human-readable message", "details": { "field": ["reason"] } }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed (`details` has per-field errors), malformed JSON, bad unlock date, public key, address or claim signature |
| 401 | Missing or invalid bearer token / webhook signature |
| 404 | Not found, or an invalid/expired recipient link |
| 409 | Action not allowed in the bottle's current state |
| 413 | Request body too large |
| 502 | Funding provider error (`details.retryable: true` means safe to retry), or the Bitcoin network rejected a claim |
| 503 | Funding provider or chain client not enabled on this server |

## Authentication

Senders get a bearer token from `POST /api/session` and send it as `Authorization: Bearer <token>`.
Recipients never authenticate; they use the high-entropy access token from their share link.
Tokens are 32 random bytes (43-char base64url). The server stores only their SHA-256 hashes.

The server never holds user private keys or message decryption keys. Both live in the share link's `#fragment`
(`/open/<token>#k=<message key>&g=<gift key>`), which browsers never send to a server.

## Bottle lifecycle

```
draft → awaiting_funding → funded → sealed → unlockable → claimed
```

| Transition | Triggered by |
| --- | --- |
| `draft → awaiting_funding` | `POST /api/bottles/:id/funding` (builds the CLTV address) |
| `awaiting_funding → funded` | Watcher sees a tx paying the lock address (mempool) |
| `funded → sealed` | Funding tx reaches `MIN_CONFIRMATIONS` |
| `sealed → unlockable` | Chain median time past ≥ locktime (BIP113, lags wall clock ~1h) |
| `unlockable → claimed` | Watcher sees the locked output spent |

All transitions go through `server/src/domain/bottleStateMachine.ts` and are recorded as `status_changed` events.
A Bitika payment never changes bottle status on its own; only the chain does.

---

## Health

### `GET /health` (also `GET /api/health`)

```json
{
  "ok": true,
  "network": "signet",
  "fundingProvider": { "name": "bitika", "env": "test" },
  "devTools": false,
  "limits": { "minSats": 1000, "minKes": 10, "maxKes": 10000 }
}
```

`fundingProvider` is `null` (and `minKes`/`maxKes` are `null`) when `FUNDING_PROVIDER=none`.

## Session

### `POST /api/session`

Body (optional): `{ "displayName": "Linnette" }`

`201` → `{ "userId": "…", "displayName": "Linnette", "token": "<43 chars>" }` — the token is returned only once.

### `GET /api/session/me` 🔒

`200` → `{ "userId": "…", "displayName": "…" }`

## Bottles (sender) 🔒

All routes require the sender's bearer token and only see bottles they own.

### Bottle object

```json
{
  "id": "cm…",
  "title": "For when you turn 18",
  "recipientName": "Ama",
  "recipientPubkey": "02…",
  "senderName": "Aunt Njoki",
  "occasion": "birthday",
  "status": "awaiting_funding",
  "amountSats": 50000,
  "unlockAt": "2030-06-18T12:00:00.000Z",
  "network": "signet",
  "createdAt": "…",
  "updatedAt": "…",
  "hasMessage": true,
  "lock": {
    "network": "signet",
    "address": "tb1q…",
    "locktime": 1908014400,
    "witnessScript": "0440fdb971b17521…ac",
    "txid": null,
    "vout": null,
    "amountSats": null,
    "confirmations": 0,
    "fundingProvider": "bitika",
    "providerRef": "SBX-…"
  }
}
```

`lock` is `null` until funding is prepared.

### `POST /api/bottles`

```json
{
  "title": "For when you turn 18",
  "recipientName": "Ama",
  "senderName": "Aunt Njoki",
  "occasion": "birthday",
  "amountSats": 50000,
  "unlockAt": "2030-06-18T12:00:00Z",
  "recipientPubkey": "02…"
}
```

- `amountSats`: integer, 1,000 – 2,100,000,000.
- `unlockAt`: ISO 8601 with offset, in the future, and within the CLTV timestamp range (≤ year 2106).
- `recipientPubkey` (optional here, required before funding): 33-byte compressed secp256k1 key, hex (`02…`/`03…`).
  The web app sends the public half of a browser-made gift key unless the sender pastes the recipient's own key.
- `senderName` (optional, ≤ 80 chars): shown to the recipient.
- `occasion` (optional): `birthday | graduation | wedding | anniversary | new_baby | just_because | other`.

`201` → bottle object, status `draft`.

### `GET /api/bottles?status=<status>`

Lists the sender's bottles, newest first. `status` is optional.

### `GET /api/bottles/:id`

Bottle object.

### `PATCH /api/bottles/:id`

`{ "recipientPubkey": "02…" }` — only while `draft`; otherwise `409`.

### `GET /api/bottles/:id/status`

Lightweight polling view:

```json
{ "id": "…", "status": "sealed", "unlockAt": "…", "txid": "…", "confirmations": 3, "updatedAt": "…" }
```

### `PUT /api/bottles/:id/message`

Attaches the **already-encrypted** message reference. Only while `draft`.

```json
{
  "type": "text",
  "objectRef": "inline",
  "ciphertext": "<base64url AES-GCM ciphertext>",
  "encryptionMeta": { "alg": "AES-GCM-256", "iv": "<base64url>" }
}
```

- `type`: `text | voice | photo` (the main kind; the web app encrypts one JSON envelope holding the letter, voice note and photo).
- `ciphertext`: up to 8,000,000 characters. This route alone accepts bodies up to 9 MB.
- `objectRef`: `"inline"` when `ciphertext` is in the body, otherwise a storage reference (≤ 500 chars).
- `encryptionMeta` must **not** contain key material; any field named like `key`, `secret` or `k` is rejected with `400`.

The web client keeps the AES key in the share link fragment (`#k=…`), which browsers never send to servers.

### `POST /api/bottles/:id/funding`

Builds the CLTV P2WSH lock and moves `draft → awaiting_funding`. Requires a recipient pubkey and an attached message.
Idempotent: once prepared, returns the same lock with `200`.

Lock script: `<locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <recipientPubkey> OP_CHECKSIG`.
If another bottle already uses the same pubkey and locktime, the locktime is nudged forward by seconds so every bottle has a unique address.

`201` → funding details:

```json
{
  "status": "awaiting_funding",
  "network": "signet",
  "address": "tb1q…",
  "amountSats": 50000,
  "locktime": 1908014400,
  "unlockAt": "2030-06-18T12:00:00.000Z",
  "witnessScript": "…",
  "bip21": "bitcoin:tb1q…?amount=0.00050000",
  "txid": null,
  "confirmations": 0
}
```

### `GET /api/bottles/:id/funding`

Same funding details; `409` if funding hasn't been prepared.

### `POST /api/bottles/:id/access`

Issues a recipient access token. Can be called again to issue another link.

`201` → `{ "token": "<43 chars>", "url": "http://localhost:5173/open/<token>" }`. Returned only once.
The web app appends `#k=…&g=…` before showing the link to the sender.

## M-Pesa top-up via Bitika 🔒

### `GET /api/funding/quote?kesAmount=500`

Prices shillings in sats before a bottle exists (the create wizard works in KES). Same quote fields as below,
without the bottle comparison. `503` when `FUNDING_PROVIDER=none`.

Bitika converts KES (M-Pesa) to sats and pays them to a **Lightning address**. It has no on-chain payout,
so the sender then sends those sats on-chain from their wallet to the bottle address. The bottle is marked
funded only when the chain watcher sees that on-chain payment.

All routes return `503` when `FUNDING_PROVIDER=none`, and require a bottle with prepared funding.

### `GET /api/bottles/:id/funding/mpesa/quote?kesAmount=500`

Example (values are illustrative; rates move):

```json
{
  "kesAmount": 500,
  "sats": 4525,
  "satsBeforeFee": 4615,
  "feeSats": 90,
  "feePercentage": 2,
  "btcPriceKes": 10834000,
  "quotedAt": "…",
  "provider": "bitika",
  "bottleAmountSats": 50000,
  "coversBottle": false
}
```

`kesAmount` must be an integer, KES 10 – 10,000.

### `POST /api/bottles/:id/funding/mpesa`

Bottle must be `awaiting_funding`.

```json
{
  "kesAmount": 500,
  "phone": "0712345678",
  "lightningAddress": "you@blink.sv",
  "idempotencyKey": "6f1c…-uuid"
}
```

- `phone`: Kenyan Safaricom/Airtel number; normalised to `2547XXXXXXXX` / `2541XXXXXXXX`. Stored masked.
- `idempotencyKey` (optional, UUID): generate one per attempt; replays return the same transaction with `200`.

`201` →

```json
{
  "transactionCode": "SBX-…",
  "status": "processing",
  "quotedSats": 4525,
  "lockAddress": "tb1q…",
  "nextStep": "Approve the M-Pesa prompt on your phone."
}
```

### `GET /api/bottles/:id/funding/mpesa/:code`

Polling fallback for when webhooks aren't configured. Returns the same shape with the latest `status` and `sats`.

| Bitika status | Meaning |
| --- | --- |
| `processing` | STK push sent; waiting for the PIN |
| `processing_payment` | M-Pesa paid; Lightning payout in progress |
| `fulfilled` | Sats delivered to the Lightning address (terminal) |
| `failed` | M-Pesa declined; no money moved (terminal) |
| `payment_failed` | M-Pesa paid but the Lightning payout failed (terminal; contact Bitika) |

## Webhooks

### `POST /api/webhooks/bitika`

Called by Bitika. Verified with the `X-Bitika-Signature: t=<unix>,v1=<hex>` header:
HMAC-SHA256 of `"<t>.<raw body>"` using `BITIKA_WEBHOOK_SECRET`, compared in constant time, rejected if `t` is
more than 5 minutes off.

- `401` on a missing or bad signature.
- `200 { "ok": true, "matched": false }` for unknown transaction codes (so Bitika doesn't retry).
- Updates are deduplicated by event id and status, and stored as `funding_provider_update` events with the transaction code.

## Recipient access (no auth)

### `GET /api/access/:token`

Recipient view of the bottle: same as the bottle object minus `recipientPubkey`, plus:

- `message`: `null` until the bottle is `unlockable` or `claimed`, then `{ type, objectRef, ciphertext, encryptionMeta }`.
- `redeemedAt`: when the recipient first opened it, or `null`.

`404` for an invalid or unknown token.

### `GET /api/access/:token/status`

Same shape as `GET /api/bottles/:id/status`.

### `POST /api/access/:token/redeem`

Records that the recipient opened the bottle. `409` unless `unlockable` or `claimed`. `200 { "ok": true }`.

### `POST /api/access/:token/claim/prepare`

Step 1 of an in-browser claim. Bottle must be `unlockable` with an on-chain funding output.

Body: `{ "address": "tb1q…" }` (must match the bottle's network).

`200` →

```json
{
  "address": "tb1q…",
  "network": "signet",
  "valueSats": 100000,
  "feeSats": 336,
  "feeRate": 3,
  "receiveSats": 99664,
  "sighash": "<32-byte hex>"
}
```

The server builds a version-2 transaction spending the lock output to `address` with `nLockTime = locktime` and
`nSequence = 0xfffffffe`, sized for the mempool.space half-hour fee rate (minimum 2 sat/vB). `sighash` is its
BIP143 signature hash. Nothing is stored; step 2 rebuilds the same transaction.

### `POST /api/access/:token/claim`

Body: `{ "address": "tb1q…", "feeSats": 336, "signature": "<64-byte compact hex, low-S>" }`

The recipient's browser signs `sighash` with the gift key from the link. The server rebuilds the transaction,
verifies the signature against the bottle's public key, adds the witness `[signature, witnessScript]` and
broadcasts it through mempool.space.

- `201` → `{ "txid": "…", "receiveSats": 99664 }`, recorded as a `claim_broadcast` event. The watcher marks the
  bottle `claimed` once it sees the spend.
- `400`: bad address, signature that doesn't match, fee over half the bottle, output below dust.
- `409`: not unlockable yet, already claimed, or no on-chain funds (for example a bottle skipped with dev tools).
- `502`: the network rejected the transaction; `error` includes the node's reason.

Recipients who were given their own public key can instead spend the P2WSH output from their wallet with the
witness script, `nLockTime ≥ locktime` and a non-final `nSequence`.

## Dev tools

Mounted only when `DEV_TOOLS=true`, which the server refuses on mainnet.

### `POST /api/dev/bottles/:id/advance` 🔒

Moves an owned bottle one step forward through the state machine (`awaiting_funding → funded → sealed →
unlockable → claimed`), recorded with `devTools: true`. No coins move, so a skipped bottle has nothing to claim.

## Configuration

See `server/.env.example`. `DEV_TOOLS=true` enables the demo shortcuts above. Switching Bitika between sandbox and live is config-only:
`BITIKA_ENV=test|live` plus the matching `bk_test_…`/`bk_live_…` key. `live` requires `BITCOIN_NETWORK=mainnet`.
