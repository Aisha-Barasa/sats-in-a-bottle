# Sats in a Bottle

**A message to the future, sealed with Bitcoin.**

Write a letter or record a voice note, attach some bitcoin, and seal it until a birthday, a graduation or any day
that matters. Built first for Kenyans abroad who already send money home and want to send more than money.

Nobody can open the bottle early, not even the sender, and not us. The date is enforced by a Bitcoin timelock,
and the message is encrypted in the sender's browser.

A Dada Devs capstone project.

---

## The journey

```
Create → Message → Date → Amount → Seal → Fund → Share → Wait → Open → Claim
```

**Sender**
1. Names the recipient and themselves, then writes a letter and optionally adds a voice note and a photo.
2. Picks the occasion and the opening date, then sets the amount in shillings (live rate) or in sats.
3. Seals it. The browser encrypts the message and makes a **gift key** for the recipient, and the server builds a
   Bitcoin address that only that key can spend, and only after the date.
4. Funds it with M-Pesa (through [Bitika](https://bitika.xyz) to their Lightning wallet, then on-chain) or
   straight from any Bitcoin wallet. It seals after one confirmation.
5. Shares the link by WhatsApp, QR code or copy and paste.

**Recipient**
1. Opens the link, or pastes it into **I received a bottle**, and sees who it's from and a countdown.
2. On the day, opens the bottle. The letter, photo and voice note decrypt in their browser.
3. Claims the sats to any Bitcoin address. The browser signs with the gift key; no wallet is needed until then.

## How it works

```
 Sender's browser                         Server (Express)                     Bitcoin (signet)
 ─────────────────                        ────────────────                     ────────────────
 AES-GCM encrypts the message  ──────▶    stores ciphertext only
 makes the gift key (secp256k1) ─pubkey▶  builds the CLTV P2WSH address  ◀──▶  watcher via mempool.space:
                                          state machine                         funded → sealed → unlockable
 share link: /open/<token>#k=<message key>&g=<gift key>
                 └─ the #fragment never leaves the browser

 Recipient's browser
 decrypts with k                          builds the claim, returns sighash
 signs the sighash with g     ─signature▶ verifies it, broadcasts       ──────▶  claim confirms → claimed
```

- **Timelock:** `<locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <recipient pubkey> OP_CHECKSIG` in a P2WSH output.
  Bitcoin checks the locktime against the chain's median time past, which runs about an hour behind the clock.
- **States:** `draft → awaiting_funding → funded → sealed → unlockable → claimed`, enforced in one module
  (`server/src/domain/bottleStateMachine.ts`) and driven by the chain, never by a payment provider.
- **The server never holds private keys or message keys.** It stores ciphertext, public keys and hashed access
  tokens.

## Run it

Needs Node.js 20.19 or newer.

```sh
git clone https://github.com/Aisha-Barasa/sats-in-a-bottle.git
cd sats-in-a-bottle
cp server/.env.example server/.env   # defaults work; add a Bitika key for M-Pesa
npm run setup                        # installs web + server, creates the SQLite dev database
npm run dev                          # web on http://localhost:5173, API on :4000
```

**Demo mode.** Set `DEV_TOOLS=true` in `server/.env` to get "Demo: skip ahead" buttons, so you can walk the whole
journey in a few minutes without waiting for blocks. No coins move, so a skipped bottle can be opened but has
nothing to claim. The server refuses demo mode in production and on mainnet.

**M-Pesa.** Set `FUNDING_PROVIDER=bitika`, `BITIKA_ENV=test` and your `BITIKA_API_KEY=bk_test_…`. Switching to live is
config only (`BITIKA_ENV=live`, a `bk_live_…` key, `BITCOIN_NETWORK=mainnet`).

**Database.** SQLite by default (`DATABASE_URL=file:./dev.db`). Set a `postgresql://…` URL to use PostgreSQL.

| Command | What it does |
| --- | --- |
| `npm run dev` | Web and API together (Ctrl+C stops both) |
| `npm run dev:web` / `npm run dev:server` | One of them alone |
| `npm test` | Server unit and API tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) against their own API and database |
| `npm run lint` | ESLint on the web app |
| `npm run typecheck` | TypeScript check of the server |
| `npm run build` | Production builds of both |
| `npm --prefix server run test:regtest` | Lock and claim on a real Bitcoin Core node (needs `BITCOIN_BIN`) |

## Testing

- **Server (Vitest, 66 tests):** state machine, locktimes, CLTV scripts, claim transactions and signatures, the REST
  API, the chain watcher against a fake chain, Bitika requests and signed webhooks.
- **Real node (`test:regtest`):** starts a throwaway Bitcoin Core regtest node, locks coins to a bottle address,
  checks the claim is rejected before the date (`non-final`), moves chain time past it, and checks the claim is
  accepted and mined.
- **Browser (Playwright):** the full journey through the real UI and API: create with a letter, photo and voice
  note, seal, share, recipient countdown, open and decrypt, claim wiring, dashboards and broken links.
- **Manual:** [docs/E2E-CHECKLIST.md](docs/E2E-CHECKLIST.md) for the real Bitika sandbox and real signet coins.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs all of the automated suites on every push and
  pull request.

## Project layout

| Path | What |
| --- | --- |
| `web/` | React + Vite app. `src/pages/` screens, `src/lib/crypto.js` encryption and gift keys, `src/lib/bottleScene.js` the 3D bottle |
| `web/e2e/` | Playwright browser tests |
| `server/` | Express + TypeScript API, Prisma, the chain watcher and Bitika |
| `server/src/bitcoin/` | CLTV lock, locktime rules and the claim transaction |
| `server/prisma/schema.prisma` | Data model: User, Bottle, Message, BitcoinLock, RecipientAccess, Event, Notification |
| `docs/API.md` | Endpoint reference |
| `docs/DESIGN-SYSTEM.md` | Colours, type, components and motion |
| `docs/PRODUCT-SPEC.md` | The original product specification |

## Known limits

- **The share link is the key.** Anyone holding it can claim once the bottle opens, so send it privately. The
  sender's browser made the gift key, so the sender could also claim it; recipients who need to rule that out
  should give the sender their own public key ("They already have a Bitcoin wallet").
- **No undo.** Once funded, nothing moves before the date. There is no sender refund path in the script yet; that
  needs designing before mainnet.
- **Sessions live in the browser.** A sender's bottles and share links are tied to the browser that sealed them.
- **M-Pesa is one way and two steps.** Bitika pays out over Lightning only, so the sender forwards the sats on-chain.
  There is no M-Pesa cash-out for recipients yet; they claim to a Bitcoin wallet or exchange.
- **No notifications yet.** The data model has them, but no SMS or email provider is connected.
- **Tested on signet only.**

## Team

This repo brings together three earlier repos:

- **Aisha Barasa** ([@Aisha-Barasa](https://github.com/Aisha-Barasa)): the user journey: shillings first, voice
  notes, occasions, "from" names and finding a bottle by link.
- **Tina** ([@Tina-dev16](https://github.com/Tina-dev16)): the design system, the 3D bottle and the web UI.
- **Linnette** ([@linnnetteseven](https://github.com/linnnetteseven)): the backend, the Bitcoin timelock and claim,
  the Bitika integration and bringing it together.
- **Florence Makaa** ([@Floramuna](https://github.com/Floramuna)): the product specification and the first frontend.

Everyone's commits are kept in the history.

---

**More than money. It's a legacy.**
