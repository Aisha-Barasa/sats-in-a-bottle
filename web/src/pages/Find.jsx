import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listReceived, parseShareLink } from '../lib/api.js';
import { fmtDay } from '../lib/format.js';

/** "I received a bottle": paste the link (or code) someone shared. */
export default function Find() {
  const nav = useNavigate();
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');
  const received = listReceived();

  function go(e) {
    e.preventDefault();
    const { token, k, g } = parseShareLink(raw);
    if (!token) return setErr('That doesn’t look like a bottle link. Paste the whole link you were sent.');
    const fragment = new URLSearchParams({ ...(k ? { k } : {}), ...(g ? { g } : {}) }).toString();
    nav(`/open/${token}${fragment ? `#${fragment}` : ''}`);
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1 className="display"><span style={{ display: 'block' }}>Find your</span><span style={{ display: 'block' }}>bottle</span></h1></div>
      <form className="card stack" onSubmit={go}>
        <label className="field"><span>The link you were sent</span>
          <textarea className="textarea" style={{ minHeight: 90, fontFamily: 'var(--font-mono)', fontSize: 14 }} spellCheck={false} autoCapitalize="off" autoFocus placeholder="https://…/open/…#k=…" value={raw} onChange={(e) => { setRaw(e.target.value); setErr(''); }} /></label>
        <p className="help">Use the full link. The part after # is the key that opens the message; it never leaves your device.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-dark" disabled={!raw.trim()}>Find my bottle</button>
      </form>
      {received.length > 0 && <div className="stack-sm">
        <span className="mono muted">OPENED ON THIS DEVICE</span>
        {received.map((r) => (
          <Link key={r.token} className="list-item" to={`/open/${r.token}`}>
            <div className="stack-sm"><div style={{ fontSize: 20 }}>{r.title}</div><div className="body-sm muted">From {r.senderName || 'someone'} · opens {fmtDay(r.unlockAt)}</div></div>
            <span className="mono muted">OPEN →</span>
          </Link>))}
      </div>}
    </div>
  );
}
