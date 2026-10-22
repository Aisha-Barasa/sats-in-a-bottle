<div align="center">

# 🍾 Sats in a Bottle

### A message to the future, sealed with Bitcoin.

Record a voice note or write a letter, attach some Bitcoin, and seal it until a birthday, a graduation or any day
that matters. Built first for Kenyans abroad sending money *and* meaning home.

![Status](https://img.shields.io/badge/status-MVP-orange?style=flat-square)
![Frontend](https://img.shields.io/badge/frontend-React_%2B_three.js-61dafb?style=flat-square&logo=react&logoColor=black)
![Backend](https://img.shields.io/badge/backend-Express_%2B_Prisma-003b57?style=flat-square&logo=express&logoColor=white)
![Bitcoin](https://img.shields.io/badge/bitcoin-CLTV_timelock_on_signet-f7931a?style=flat-square&logo=bitcoin&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square)

[Overview](#overview) · [The journey](#the-journey) · [How it works](#how-it-works) · [Quick start](#quick-start) ·
[Testing](#testing) · [Known limits](#known-limits) · [Roadmap](#roadmap) · [Team](#team) · [License](#license)

A Dada Devs capstone project.

</div>

---

## Overview

Sending money home is routine. Sending a *moment* usually isn't: a voice note for a niece's 18th birthday, or a
letter for a graduation you'll miss. There's no simple way to attach meaning to a transfer and have it land exactly
when it matters.

**Sats in a Bottle** fixes that. Record a message, attach Bitcoin, pick a date. The bottle stays sealed until then.
On the day, the recipient hears the message and claims the funds.

| | |
|---|---|
| 🎙️ **Record or write** | A voice note, a letter and a photo, for someone specific |
| ₿ **Attach Bitcoin** | Paid in shillings with M-Pesa, or from any Bitcoin wallet |
| 📅 **Pick a date** | A birthday, graduation, wedding or any day that matters |
| 🔒 **Nobody opens it early** | Not the recipient, not the sender, not us. A Bitcoin timelock enforces the date |
| 🔓 **Opens on the day** | The message decrypts in the recipient's browser and they claim the sats to their wallet |

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

---

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

### Repository layout

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

---

## Quick start

Needs Node.js 20.19 or newer.

```sh
git clone https://github.com/Aisha-Barasa/sats-in-a-bottle.git
cd sats-in-a-bottle
cp server/.env.example server/.env   # defaults work; add a Bitika key for M-Pesa
npm run setup                        # installs web + server, creates the SQLite dev database
npm run dev                          # web on http://localhost:5173, API on :4000
```

> [!TIP]
> **Demo mode.** Set `DEV_TOOLS=true` in `server/.env` to get "Demo: skip ahead" buttons, so you can walk the whole
> journey in a few minutes without waiting for blocks. No coins move, so a skipped bottle can be opened but has
> nothing to claim. The server refuses demo mode on mainnet.

> [!NOTE]
> Recording a voice note needs the page served over `http://localhost` or `https://`. Browsers block the
> microphone elsewhere. Writing a letter always works.

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

### Deploy to Vercel

One Vercel project serves both: the web app as static files and the API as a Vercel Function at `/api`
(`vercel.json`, `api/index.js`). Two things differ from running locally:

- **PostgreSQL, not SQLite.** Vercel's filesystem is wiped between requests. Add a Neon database from the Vercel
  Marketplace; it sets `DATABASE_URL`, and every build applies the schema.
- **No background watcher.** A function can't keep a timer running, so the API checks the chain when someone opens
  a bottle, at most once every `WATCHER_INTERVAL_MS`.

Set these in the project's environment variables: `BITCOIN_NETWORK`, `PUBLIC_APP_URL` (the deployment's URL),
`WATCHER_INTERVAL_MS=15000`, and optionally `FUNDING_PROVIDER=bitika`, `BITIKA_ENV`, `BITIKA_API_KEY` (mark it
sensitive) and `DEV_TOOLS=true` for a signet demo. Vercel limits request bodies to 4.5 MB, so a long voice note
plus a photo can be too big to seal there.

---

## Testing

- **Server (Vitest, 68 tests):** state machine, locktimes, CLTV scripts, claim transactions and signatures, the REST
  API, the chain watcher against a fake chain, Bitika requests and signed webhooks.
- **Real node (`test:regtest`):** starts a throwaway Bitcoin Core regtest node, locks coins to a bottle address,
  checks the claim is rejected before the date (`non-final`), moves chain time past it, and checks the claim is
  accepted and mined.
- **Browser (Playwright):** the full journey through the real UI and API: create with a letter, photo and voice
  note, seal, share, recipient countdown, open and decrypt, claim wiring, dashboards and broken links.
- **Manual:** [docs/E2E-CHECKLIST.md](docs/E2E-CHECKLIST.md) for the real Bitika sandbox and real signet coins.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs all of the automated suites on every push and
  pull request.

---

## Known limits

| Limit | Why | Upgrade path |
|---|---|---|
| **The share link is the key** | Anyone holding it can claim once the bottle opens, including the sender, whose browser made the gift key | Recipients who need to rule that out give the sender their own public key ("They already have a Bitcoin wallet") |
| **No undo** | Once funded, nothing moves before the date | A sender refund path in the script, designed before mainnet |
| **Sessions live in the browser** | No passwords: a sender's bottles and share links are tied to the browser that sealed them | Optional accounts or a recovery code |
| **M-Pesa is one way and two steps** | Bitika pays out over Lightning only, so the sender forwards the sats on-chain | Direct on-chain funding from the provider, and an M-Pesa cash-out for recipients |
| **No notifications yet** | The data model has them, but no SMS or email provider is connected | Connect an SMS provider such as Africa's Talking |
| **Signet only** | Test money while the product is validated | Mainnet after the refund path and a small controlled test |

---

## Roadmap

- [x] Real CLTV timelocking, on-chain
- [x] Wire the frontend to the backend API
- [x] Claim in the recipient's browser, with no private keys on the server
- [ ] Sender refund path
- [ ] SMS or email notifications on the day
- [ ] Direct M-Pesa cash-out for recipients
- [ ] Multi-recipient "inheritance bottles"
- [ ] Video notes, alongside voice notes and letters

---

## Contributing

Issues, ideas and pull requests are welcome. If you're picking this up:

1. Create a feature branch from `main`.
2. Run `npm test`, `npm run lint` and `npm run typecheck` before you push. CI runs them and the browser tests too.
3. Open a PR describing what changed and why.

---

## Team

This repo brings together three earlier repos:

- **Aisha Barasa** ([@Aisha-Barasa](https://github.com/Aisha-Barasa)): the user journey: shillings first, voice
  notes, occasions, "from" names and finding a bottle by link.
- **Tina** ([@Tina-dev16](https://github.com/Tina-dev16)): the design system, the 3D bottle and the web UI.
- **Linnette** ([@linnnetteseven](https://github.com/linnnetteseven)): the backend, the Bitcoin timelock and claim,
  the Bitika integration and bringing it together.
- **Florence Makaa** ([@Floramuna](https://github.com/Floramuna)): the product specification and the first frontend.
- **Jael Wainaina** ([@Jael2424](https://github.com/Jael2424)): the README's structure and presentation.

Everyone's commits are kept in the history.

---

## License

MIT. See [`LICENSE`](LICENSE).

---

<div align="center">

**More than money. It's a legacy.** 🍾

</div>
