// Checks once a day for any sealed bottle whose unlock_date has arrived,
// marks it opened, and notifies the recipient.
//
// This is the software stand-in for a real Bitcoin timelock unlock:
// v1 (MVP) — funds sit in a custodial wallet; this job flips a status flag.
// v2        — funds sit in a CLTV-locked UTXO on-chain; this job just
//             watches block height and notifies, since the chain itself
//             enforces the lock.
const cron = require("node-cron");
const db = require("./db");
const { notifyBottleOpened } = require("./sms");

function checkAndOpenBottles() {
  const today = new Date().toISOString().split("T")[0];
  const due = db
    .prepare(`SELECT * FROM bottles WHERE status = 'sealed' AND unlock_date <= ?`)
    .all(today);

  for (const bottle of due) {
    db.prepare(
      `UPDATE bottles SET status = 'opened', opened_at = datetime('now') WHERE id = ?`
    ).run(bottle.id);
    notifyBottleOpened(bottle).catch(err =>
      console.error(`Failed to notify recipient for bottle ${bottle.id}:`, err)
    );
    console.log(`[scheduler] Bottle ${bottle.id} opened for ${bottle.recipient_name}`);
  }

  if (due.length) console.log(`[scheduler] Opened ${due.length} bottle(s).`);
}

function start() {
  // Runs daily at 08:00. Use "* * * * *" locally to test every minute.
  cron.schedule("0 8 * * *", checkAndOpenBottles);
  console.log("[scheduler] Daily unlock check scheduled for 08:00.");
}

module.exports = { start, checkAndOpenBottles };
