// Minimal SQLite setup for the MVP.
// Swap for Postgres later by replacing this file — the query shape stays similar.
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "bottles.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS bottles (
    id              TEXT PRIMARY KEY,
    sender_name     TEXT NOT NULL,
    payer_phone     TEXT NOT NULL,
    recipient_name  TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    occasion        TEXT NOT NULL,
    message_type    TEXT NOT NULL,      -- 'voice' | 'letter'
    letter_text     TEXT,
    audio_path      TEXT,               -- path/URL to stored audio file
    unlock_date     TEXT NOT NULL,      -- ISO date, e.g. 2044-03-14
    kes_amount      INTEGER NOT NULL,
    sats            INTEGER NOT NULL,
    btc_tx_id       TEXT,               -- populated once the CLTV-locked tx is broadcast
    mpesa_receipt   TEXT,               -- Daraja receipt for the inbound payment
    status          TEXT NOT NULL DEFAULT 'pending_payment',
                    -- pending_payment | sealed | opened | claimed
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    opened_at       TEXT,
    claimed_at      TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_unlock_date ON bottles(unlock_date);
  CREATE INDEX IF NOT EXISTS idx_status ON bottles(status);
`);

module.exports = db;
