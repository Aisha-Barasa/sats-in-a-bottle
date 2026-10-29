export const fmtSats = (n) => Number(n).toLocaleString('en-US');

/** Mirrors serviceFeeFor on the server: basis points of the amount, skipped below Bitcoin's 330-sat dust limit. */
export function serviceFee(sats, bps) {
  const fee = Math.floor((sats * (bps || 0)) / 10_000);
  return fee >= 330 ? fee : 0;
}
export const fmtBps = (bps) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
export const fmtBtc = (sats) => (sats / 1e8).toFixed(8);
export const fmtKes = (n) => `KES ${Number(n).toLocaleString('en-KE')}`;
export const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const fmtDay = (d) => new Date(d).toLocaleDateString(undefined, { dateStyle: 'long' });
export const ms = (d) => new Date(d).getTime();

// Bottle states from server/src/domain/bottleStateMachine.ts.
export const STATUS = {
  draft: { label: 'Draft', hint: 'Not sealed yet' },
  awaiting_funding: { label: 'Awaiting funds', hint: 'Waiting for the bitcoin to arrive' },
  funded: { label: 'Funded', hint: 'Payment seen, confirming' },
  sealed: { label: 'Sealed', hint: 'Locked until the day' },
  unlockable: { label: 'Ready to open', hint: 'The day has come' },
  claimed: { label: 'Claimed', hint: 'Sats delivered' },
};
export const LOCKED = ['funded', 'sealed'];
export const OPEN = ['unlockable', 'claimed'];

export const OCCASIONS = [
  ['birthday', 'Birthday'],
  ['graduation', 'Graduation'],
  ['wedding', 'Wedding'],
  ['anniversary', 'Anniversary'],
  ['new_baby', 'New baby'],
  ['just_because', 'Just because'],
  ['other', 'Other'],
];
export const occasionLabel = (o) => OCCASIONS.find(([k]) => k === o)?.[1] ?? '';

export function explorerTx(network, txid) {
  const base = network === 'mainnet' ? 'https://mempool.space' : network === 'testnet' ? 'https://mempool.space/testnet4' : 'https://mempool.space/signet';
  return `${base}/tx/${txid}`;
}

export function splitDuration(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
export function humanLeft(msLeft) {
  const { d, h, m, s } = splitDuration(msLeft);
  if (d >= 2) return `${d} days`;
  if (d === 1) return `1 day ${h}h`;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m ${s}s`;
  return `${s}s`;
}

// Shown when the countdown has hit zero but Bitcoin's median time past hasn't caught up yet.
export const CHAIN_CLOCK_NOTE = 'The time has passed. Bitcoin’s clock runs up to an hour behind, so it opens as soon as the network agrees. This page updates on its own.';
