import { Link } from 'react-router-dom';
import { fmtDate, fmtSats, humanLeft, ms } from '../lib/format.js';
import { bottleHref } from '../lib/useBottles.js';
import { StatusTag } from './ui.jsx';

export function unlockLine(b) {
  if (b.status === 'sealed') return `Opens in ${humanLeft(ms(b.unlockAt) - Date.now())} · ${fmtDate(b.unlockAt)}`;
  return `Opens ${fmtDate(b.unlockAt)}`;
}

export const whoLine = (b) => (b.token ? `From ${b.senderName || 'someone'}` : `To ${b.recipientName}`);

export default function BottleRow({ b }) {
  return (
    <Link to={bottleHref(b)} className="list-item">
      <div className="stack-sm">
        <div className="row wrap-r"><StatusTag status={b.status} /><span className="mono muted">{whoLine(b)}</span></div>
        <div style={{ fontSize: 20, letterSpacing: '-0.02em' }}>{b.title}</div>
        <div className="body-sm muted">{unlockLine(b)}</div>
      </div>
      <div style={{ textAlign: 'right' }}><div className="h3 num">{fmtSats(b.amountSats)}</div><div className="mono muted">SATS</div></div>
    </Link>
  );
}
