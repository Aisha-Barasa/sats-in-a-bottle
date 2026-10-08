# Sats in a Bottle

A message to the future, sealed with Bitcoin. Record a voice note or letter,
attach some Bitcoin, and seal it until a birthday, graduation, or any date
that matters — built first for Kenyans abroad sending money and meaning home.

## What's in this repo

```
sats-in-a-bottle/
├── frontend/     A fully working, click-through MVP — no build step, no
│                 backend required. Bottles are stored in the browser's
│                 localStorage so the whole flow is demoable offline.
└── backend/      A real API scaffold (Express + SQLite) with the actual
                  integration points stubbed: M-Pesa STK push/payout,
                  SMS notifications, and the daily unlock scheduler.
```

## Running the frontend (the demo)

No install needed.

```bash
cd frontend
python3 -m http.server 8080   # or just double-click index.html
```

Open `http://localhost:8080`. Walk through: **Create a bottle → record or
write a message → choose an occasion and date → fund with mock M-Pesa →
see the confirmation → view it on the dashboard.**

To see the *recipient's* side without waiting years, go to **My bottles**
and click **"Load a demo bottle"** — it seeds one with an unlock date of
yesterday, so you can click straight into the unlock/reveal/claim flow.

> Note: microphone recording requires the page to be served over
> `http://localhost` or `https://` (not opened directly as a `file://`
> URL) in most browsers. Writing a letter always works.

## Running the backend (real integration scaffold)

```bash
cd backend
npm install
cp .env.example .env     # fill in Daraja + Africa's Talking credentials
npm start
```

This gives you real endpoints (`/api/bottles`, `/api/bottles/:id/claim`,
`/api/bottles/mpesa/callback`) backed by SQLite, plus a daily cron job
that opens bottles whose date has arrived. `services/mpesa.js` and
`services/sms.js` are intentionally left as clearly-labeled stubs —
swap in real Safaricom Daraja and Africa's Talking calls when you're
ready to go beyond the click-through demo.

The frontend and backend aren't wired together yet — that's the natural
next step once you're happy with the flow (replace `frontend/js/app.js`'s
`Store` object with `fetch` calls into the API above).

## MVP scope, deliberately

To keep this buildable fast:
- **No real Bitcoin timelock yet.** Funds are conceptually held and released
  by a date check (`services/scheduler.js`), not an on-chain CLTV
  transaction. The path to the real thing is a drop-in replacement of that
  one file once the core product is validated.
- **No self-custody wallets.** Custodial by default — simpler onboarding,
  matches how most first-time users expect a KES-in, KES-out product to work.
- **One on/off-ramp partner**, not a multi-exchange setup.
- **Mobile web, not native apps** — works in any browser, nothing to install.

## Next steps

See `PROJECT.md`-style notes in the original pitch: real CLTV timelocking,
multi-recipient "inheritance bottles," stablecoin support, video notes, and
direct M-Pesa cash-out integration are all natural v2 additions once this
core loop is validated with real users.
