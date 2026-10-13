<div align="center">

# 🍾 Sats in a Bottle

### A message to the future, sealed with Bitcoin.

Record a voice note or letter, attach some Bitcoin, and seal it until a birthday, graduation, or any date that matters — built first for Kenyans abroad sending money *and* meaning home.

![Status](https://img.shields.io/badge/status-MVP-orange?style=flat-square)
![Frontend](https://img.shields.io/badge/frontend-vanilla_JS-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![Backend](https://img.shields.io/badge/backend-Express_%2B_SQLite-003b57?style=flat-square&logo=express&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square)

[Overview](#overview) · [Quick start](#quick-start) · [Architecture](#architecture) · [MVP scope](#mvp-scope-deliberately-narrow) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

## Overview

Sending money home is routine. Sending a *moment* — a voice for a niece's 18th birthday, a letter for a graduation you'll miss — usually isn't, because there's no simple way to attach meaning to a transfer and have it land exactly when it matters.

**Sats in a Bottle** fixes that: record a message, attach Bitcoin, pick a date. The bottle stays sealed until then. On the day, the recipient hears the message and can claim the funds.

| | |
|---|---|
| 🎙️ **Record or write** | A voice note or letter, for someone specific |
| ₿ **Attach Bitcoin** | Funded in KES via M-Pesa, held until the chosen date |
| 📅 **Pick a date** | A birthday, graduation, anniversary — any date that matters |
| 🔓 **Opens automatically** | The recipient is notified, the message plays, and the funds unlock |

---

## Repository layout

```
sats-in-a-bottle/
├── frontend/   A fully working, click-through MVP — no build step, no backend
│               required. Bottles persist in the browser's localStorage, so
│               the whole flow is demoable offline.
│
└── backend/    A real API scaffold (Express + SQLite) with the integration
                points stubbed and clearly labeled: M-Pesa STK push/payout,
                SMS notifications, and the daily unlock scheduler.
```

The frontend and backend are **not wired together yet** — that's by design. The frontend works standalone for demos; the backend is the scaffold to build on when you're ready to go live. See [Architecture](#architecture) for how they'll connect.

---

## Quick start

### Frontend (the demo) — zero install

```bash
cd frontend
python3 -m http.server 8080   # or: npx serve .
```

Open **http://localhost:8080** and walk through the flow:

> **Create a bottle** → record or write a message → choose an occasion and date → fund with mock M-Pesa → confirmation → view it on the dashboard

To preview the **recipient's side** without waiting years, go to **My bottles → Load a demo bottle** — it seeds a bottle with yesterday's unlock date, so you land straight in the unlock → reveal → claim flow.

> [!NOTE]
> Microphone recording requires the page to be served over `http://localhost` or `https://` — not opened directly as a `file://` URL, since most browsers block mic access on that scheme. Writing a letter always works, no server needed.

### Backend (real integration scaffold)

```bash
cd backend
npm install
cp .env.example .env     # fill in Daraja + Africa's Talking credentials
npm start
```

This spins up real endpoints backed by SQLite, plus a daily cron job that opens any bottle whose unlock date has arrived:

| Endpoint | Purpose |
|---|---|
| `POST /api/bottles` | Create a bottle |
| `GET /api/bottles/:id` | Fetch a bottle |
| `POST /api/bottles/:id/claim` | Recipient claims funds |
| `POST /api/bottles/mpesa/callback` | Daraja payment webhook |

`services/mpesa.js` and `services/sms.js` are intentionally left as clearly-labeled stubs — swap in real Safaricom Daraja and Africa's Talking calls when you're ready to move past the click-through demo.

---

## Architecture

```
┌─────────────┐        localStorage         ┌──────────────┐
│  frontend/  │ ───────  (today)  ────────▶  │   demoable   │
│  (vanilla)  │                              │   in-browser │
└─────────────┘                              └──────────────┘

┌─────────────┐          fetch()             ┌──────────────┐      ┌───────────┐
│  frontend/  │ ───────  (next step)  ─────▶  │  backend/    │ ───▶ │  SQLite   │
│  (vanilla)  │ ◀──────────────────────────   │  (Express)   │      └───────────┘
└─────────────┘                              └──────┬───────┘
                                                      │
                                       ┌──────────────┼──────────────┐
                                       ▼              ▼              ▼
                                  M-Pesa (Daraja)  SMS (AT)   Unlock scheduler
```

Connecting the two means swapping the `Store` object in `frontend/js/app.js` for `fetch()` calls into the API above. Nothing else in the frontend needs to change — it was built against that same shape from the start.

---

## MVP scope (deliberately narrow)

To keep this buildable fast, a few corners are cut on purpose — each with a clear upgrade path:

| Decision | Why | Upgrade path |
|---|---|---|
| **No real Bitcoin timelock yet** | Funds are conceptually held and released by a date check (`services/scheduler.js`), not an on-chain CLTV transaction | Drop-in replacement of that one file once the core product is validated |
| **No self-custody wallets** | Custodial by default — simpler onboarding, matches how first-time users expect a KES-in, KES-out product to work | Optional self-custody mode once there's real demand |
| **One on/off-ramp partner** | Simpler integration surface than a multi-exchange setup | Add partners as volume justifies it |
| **Mobile web, not native apps** | Works in any browser, nothing to install | Wrap as a PWA or native shell later if needed |

---

## Roadmap

- [ ] Real CLTV timelocking, on-chain
- [ ] Multi-recipient "inheritance bottles"
- [ ] Stablecoin support alongside Bitcoin
- [ ] Video notes, not just voice/letter
- [ ] Direct M-Pesa cash-out integration
- [ ] Wire the frontend to the backend API

---

## Contributing

This is an early-stage MVP — issues, ideas, and pull requests are welcome. If you're picking this up:

1. Fork the repo and create a feature branch
2. Keep the frontend's zero-build-step philosophy intact unless there's a strong reason to add tooling
3. Open a PR describing what changed and why

---

## License

MIT — see [`LICENSE`](LICENSE).

<div align="center">

Built for everyone, one bottle at a time. 🍾

</div>
