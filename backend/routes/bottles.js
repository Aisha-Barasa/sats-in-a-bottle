const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../services/db");
const { initiateStkPush, payoutToRecipient } = require("../services/mpesa");
const { notifyBottleSealed } = require("../services/sms");

const router = express.Router();
const BTC_KES_RATE = Number(process.env.BTC_KES_RATE || 11_800_000);
const kesToSats = kes => Math.round((kes / BTC_KES_RATE) * 100_000_000);

/**
 * POST /api/bottles
 * Creates a bottle in `pending_payment` and triggers an M-Pesa STK push.
 * Body: { senderName, payerPhone, recipientName, recipientPhone,
 *          occasion, messageType, letterText?, audioPath?, unlockDate, kesAmount }
 */
router.post("/", async (req, res) => {
  const {
    senderName, payerPhone, recipientName, recipientPhone,
    occasion, messageType, letterText, audioPath, unlockDate, kesAmount
  } = req.body;

  if (!senderName || !payerPhone || !recipientName || !recipientPhone || !unlockDate || !kesAmount) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  if (new Date(unlockDate) <= new Date()) {
    return res.status(400).json({ error: "Unlock date must be in the future." });
  }

  const id = uuidv4();
  const sats = kesToSats(kesAmount);

  db.prepare(`
    INSERT INTO bottles
      (id, sender_name, payer_phone, recipient_name, recipient_phone, occasion,
       message_type, letter_text, audio_path, unlock_date, kes_amount, sats, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment')
  `).run(id, senderName, payerPhone, recipientName, recipientPhone, occasion,
         messageType, letterText || null, audioPath || null, unlockDate, kesAmount, sats);

  const stk = await initiateStkPush({
    phone: payerPhone,
    amountKes: kesAmount,
    accountRef: `bottle-${id.slice(0, 8)}`
  });

  res.status(201).json({ bottleId: id, sats, stk });
});

/**
 * POST /api/mpesa/callback
 * Safaricom calls this once the STK push is completed by the payer.
 * Body shape follows Daraja's callback payload — simplified here.
 */
router.post("/mpesa/callback", (req, res) => {
  const { bottleId, success, mpesaReceipt } = req.body;
  const bottle = db.prepare(`SELECT * FROM bottles WHERE id = ?`).get(bottleId);
  if (!bottle) return res.status(404).json({ error: "Bottle not found." });

  if (success) {
    db.prepare(`
      UPDATE bottles SET status = 'sealed', mpesa_receipt = ? WHERE id = ?
    `).run(mpesaReceipt || null, bottleId);

    // TODO: broadcast the real CLTV-locked BTC transaction here, store btc_tx_id
    notifyBottleSealed({ ...bottle, status: "sealed" }).catch(console.error);
  }

  res.json({ ok: true });
});

/** GET /api/bottles/:id — fetch a single bottle (used by the unlock page) */
router.get("/:id", (req, res) => {
  const bottle = db.prepare(`SELECT * FROM bottles WHERE id = ?`).get(req.params.id);
  if (!bottle) return res.status(404).json({ error: "Bottle not found." });

  // Don't leak the note content before the unlock date.
  const isOpen = bottle.status === "opened" || bottle.status === "claimed" ||
                 new Date(bottle.unlock_date) <= new Date();
  if (!isOpen) {
    const { letter_text, audio_path, ...safe } = bottle;
    return res.json(safe);
  }
  res.json(bottle);
});

/** GET /api/bottles?senderPhone=... — list bottles for a sender's dashboard */
router.get("/", (req, res) => {
  const { senderPhone } = req.query;
  const rows = senderPhone
    ? db.prepare(`SELECT * FROM bottles WHERE payer_phone = ? ORDER BY created_at DESC`).all(senderPhone)
    : db.prepare(`SELECT * FROM bottles ORDER BY created_at DESC`).all();
  res.json(rows);
});

/** POST /api/bottles/:id/claim — recipient cashes out to M-Pesa */
router.post("/:id/claim", async (req, res) => {
  const bottle = db.prepare(`SELECT * FROM bottles WHERE id = ?`).get(req.params.id);
  if (!bottle) return res.status(404).json({ error: "Bottle not found." });
  if (bottle.status !== "opened") return res.status(400).json({ error: "Bottle isn't open yet." });

  const payout = await payoutToRecipient({
    phone: bottle.recipient_phone,
    amountKes: bottle.kes_amount,
    remarks: `Sats in a Bottle — ${bottle.occasion}`
  });

  db.prepare(`UPDATE bottles SET status = 'claimed', claimed_at = datetime('now') WHERE id = ?`)
    .run(bottle.id);

  res.json({ ok: true, payout });
});

module.exports = router;
