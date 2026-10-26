import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, getSent } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CHAIN_CLOCK_NOTE, STATUS, explorerTx, fmtBtc, fmtDate, fmtDay, fmtKes, fmtSats, ms, occasionLabel } from '../lib/format.js';
import BottleCanvas from '../components/BottleCanvas.jsx';
import { CopyButton, Countdown, Loading, QrBox, Spinner, StatusTag, useAsync } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

const STAGE = { draft: 0.3, awaiting_funding: 0.5, funded: 0.75, sealed: 1, unlockable: 1, claimed: 1 };
const FLOW = ['Create', 'Fund', 'Confirm', 'Share', 'Wait', 'Open', 'Claim'];
const FLOW_AT = { draft: 1, awaiting_funding: 1, funded: 2, sealed: 4, unlockable: 5, claimed: 7 };
const ANNOUNCE = { funded: 'Payment seen on the Bitcoin network', sealed: 'Confirmed. The bottle is sealed', unlockable: 'The bottle is ready to open', claimed: 'The sats were claimed' };

export default function BottleView() {
  const { id } = useParams();
  const toast = useToast();
  const [b, setB] = useState(null);
  const [missing, setMissing] = useState(false);
  const prev = useRef(null);

  const load = useCallback(async () => {
    try {
      const bottle = await api.getBottle(id);
      if (prev.current && prev.current !== bottle.status && ANNOUNCE[bottle.status]) toast(ANNOUNCE[bottle.status]);
      prev.current = bottle.status;
      setB(bottle);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) setMissing(true);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { // the chain watcher moves bottles on; keep up with it
    if (!b || b.status === 'claimed') return;
    const t = setInterval(load, b.status === 'awaiting_funding' || b.status === 'funded' ? 10_000 : 15_000);
    return () => clearInterval(t);
  }, [b?.status, load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return <div className="center-screen"><div className="card stack" style={{ padding: 40 }}><h1 className="display">Not found</h1><p className="muted">This bottle isn’t on this device. If someone shared it with you, open their link instead.</p><Link to="/find" className="btn btn-dark">Find a bottle</Link></div></div>;
  if (!b) return <Loading />;
  const open = b.status === 'unlockable' || b.status === 'claimed';
  return (
    <div className="stack">
      <div className="page-head stack-sm">
        <Link to="/bottles" className="mono muted">← BOTTLES</Link>
        <div className="row wrap-r"><StatusTag status={b.status} /><span className="mono muted">TO {b.recipientName.toUpperCase()}{b.occasion ? ` · ${occasionLabel(b.occasion).toUpperCase()}` : ''}</span></div>
        <h1 className="display">{b.title}</h1>
      </div>
      <ol className="stepper" style={{ padding: 0, margin: 0 }} aria-label="Progress">
        {FLOW.map((s, i) => <li key={s} className={`crumb ${i < FLOW_AT[b.status] ? 'done' : ''} ${i === FLOW_AT[b.status] ? 'now' : ''}`}><i>{String(i + 1).padStart(2, '0')}</i>{s}</li>)}
      </ol>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Hero b={b} open={open} />
        <div className="stack">
          {b.status === 'draft' && <FinishDraft b={b} reload={load} />}
          {b.status === 'awaiting_funding' && <FundPanel b={b} />}
          {b.status === 'funded' && <Confirming b={b} />}
          {b.status === 'sealed' && <><Locked b={b} reload={load} /><SharePanel b={b} /></>}
          {b.status === 'unlockable' && <><WaitingForClaim b={b} /><SharePanel b={b} /></>}
          {b.status === 'claimed' && <Claimed b={b} />}
          <DevSkip b={b} reload={load} />
          {b.lock && <LockDetails b={b} />}
        </div>
      </div>
    </div>
  );
}

function Hero({ b, open }) {
  const [pop, setPop] = useState(0);
  useEffect(() => { if (!open) return setPop(0); const t = setTimeout(() => setPop(1), 700); return () => clearTimeout(t); }, [open]);
  return (
    <div className="hero-bottle bv-hero">
      <BottleCanvas zoom={0.88} progress={STAGE[b.status] ?? 1} open={pop} label={open ? 'The bottle has opened' : `A ${STATUS[b.status]?.label.toLowerCase()} bottle`} />
      <div style={{ position: 'absolute', left: 20, bottom: 20 }} className="tag dark">{fmtSats(b.amountSats)} sats</div>
    </div>
  );
}

function FinishDraft({ b, reload }) {
  const { busy, error, run } = useAsync();
  return (
    <div className="card stack">
      <h2 className="h2">Almost there</h2>
      <p className="muted">The bottle was saved but its Bitcoin address wasn’t made yet.</p>
      {error && <p className="err" role="alert">{error.message}</p>}
      <button className="btn btn-dark" disabled={busy} onClick={() => run(async () => { await api.prepareFunding(b.id); await reload(); })}>{busy ? <Spinner /> : 'Make the funding address'}</button>
    </div>
  );
}

/* ---------- funding ---------- */

function FundPanel({ b }) {
  const { config } = useAuth();
  const mpesa = Boolean(config?.fundingProvider);
  const [method, setMethod] = useState(mpesa ? 'mpesa' : 'bitcoin');
  const [f, setF] = useState(null);
  const { error, run } = useAsync();
  useEffect(() => { run(async () => setF(await api.getFunding(b.id))); }, [b.id, run]);
  return (
    <div className="card stack">
      <h2 className="h2">Fund the bottle</h2>
      <div className="card mist sm row between wrap-r"><div><div className="amount-big num" style={{ fontSize: 56 }}>{fmtSats(b.amountSats)}</div><span className="mono muted">SATS</span></div><div style={{ textAlign: 'right' }}><div className="h3 num">{fmtBtc(b.amountSats)}</div><span className="mono muted">BTC</span></div></div>
      {b.network !== 'mainnet' && <div className="callout warn">Bitcoin {b.network}: send test coins only, never real bitcoin.</div>}
      {mpesa && <div className="seg" role="tablist" style={{ alignSelf: 'flex-start' }}>
        <button role="tab" aria-selected={method === 'mpesa'} onClick={() => setMethod('mpesa')}>M-Pesa</button>
        <button role="tab" aria-selected={method === 'bitcoin'} onClick={() => setMethod('bitcoin')}>Bitcoin wallet</button>
      </div>}
      {error && <p className="err">{error.message}</p>}
      {!f && !error && <Loading />}
      {f && method === 'bitcoin' && <SendBitcoin f={f} />}
      {f && method === 'mpesa' && <MpesaTopUp b={b} f={f} />}
      <div className="row"><Spinner /><span className="muted body-sm">Watching the Bitcoin network. This page updates on its own.</span></div>
    </div>
  );
}

function SendBitcoin({ f }) {
  return (
    <div className="grid g2" style={{ alignItems: 'center' }}>
      <QrBox text={f.bip21} alt="Bitcoin payment QR code" />
      <div className="stack-sm">
        <span className="mono muted">BOTTLE ADDRESS</span>
        <div className="copybox"><code>{f.address}</code></div>
        <div className="row wrap-r"><CopyButton text={f.address} /><a className="btn btn-light btn-sm" href={f.bip21}>Open in my wallet</a></div>
        <p className="help">Send exactly {fmtSats(f.amountSats)} sats. It seals after one confirmation.</p>
      </div>
    </div>
  );
}

const TERMINAL = new Set(['fulfilled', 'failed', 'payment_failed']);

/** M-Pesa buys sats into the sender's own Lightning wallet; they then send them on-chain to the bottle. */
function MpesaTopUp({ b, f }) {
  const saved = getSent(b.id);
  const [form, setForm] = useState({ kes: saved?.kes ? String(saved.kes) : '', phone: '', ln: '' });
  const [quote, setQuote] = useState(null);
  const [pay, setPay] = useState(null);
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const { busy, error, run, setError } = useAsync();
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); if (k === 'kes') setQuote(null); };

  useEffect(() => {
    if (!pay || TERMINAL.has(pay.status)) return;
    const t = setInterval(() => { api.mpesaStatus(b.id, pay.transactionCode).then(setPay).catch(() => {}); }, 4000);
    return () => clearInterval(t);
  }, [b.id, pay]);

  if (pay) {
    const done = TERMINAL.has(pay.status);
    return (
      <div className="stack-sm">
        <span className="mono muted">M-PESA · {pay.transactionCode}</span>
        <div className={`callout ${pay.status === 'fulfilled' ? '' : done ? 'bad' : 'warn'}`}>{!done && <Spinner />} {pay.nextStep}</div>
        {pay.status === 'fulfilled' && <><span className="mono muted">NOW SEND FROM YOUR LIGHTNING WALLET TO</span><div className="copybox"><code>{f.address}</code></div><CopyButton text={f.address} /></>}
        {done && pay.status !== 'fulfilled' && <button className="btn btn-ghost btn-sm" onClick={() => { setPay(null); setAttempt(crypto.randomUUID()); }}>Try again</button>}
      </div>
    );
  }
  return (
    <div className="stack-sm">
      <p className="body-sm muted">1. Pay with M-Pesa and Bitika sends sats to your Lightning wallet. 2. From that wallet, send them to the bottle address.</p>
      <label className="field"><span>Amount (KES)</span><input className="input num" inputMode="numeric" value={form.kes} onChange={set('kes')} placeholder="1000" /></label>
      <label className="field"><span>Your M-Pesa number</span><input className="input" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={form.phone} onChange={set('phone')} /></label>
      <label className="field"><span>Your Lightning address</span><input className="input" autoCapitalize="off" spellCheck={false} placeholder="you@blink.sv" value={form.ln} onChange={set('ln')} /></label>
      {quote && <div className="callout">{fmtKes(quote.kesAmount)} buys {fmtSats(quote.sats)} sats (fee {fmtSats(quote.feeSats)}). {quote.coversBottle ? 'Enough for this bottle.' : `The bottle needs ${fmtSats(b.amountSats)}.`}</div>}
      {error && <p className="err" role="alert">{error.status === 503 ? 'M-Pesa top-ups are not enabled on this server.' : error.message}</p>}
      <div className="row wrap-r">
        <button className="btn btn-ghost btn-sm" disabled={busy || !form.kes} onClick={() => run(async () => setQuote(await api.mpesaQuote(b.id, form.kes)))}>Get quote</button>
        <button className="btn btn-dark btn-sm" disabled={busy || !form.kes || !form.phone || !form.ln} onClick={() => run(async () => {
          setError(null);
          setPay(await api.mpesaPay(b.id, { kesAmount: Number(form.kes), phone: form.phone, lightningAddress: form.ln, idempotencyKey: attempt }));
        })}>{busy ? <Spinner /> : 'Send M-Pesa prompt'}</button>
      </div>
    </div>
  );
}

function Confirming({ b }) {
  return (
    <div className="card ink stack">
      <span className="tag light">Payment seen</span>
      <h2 className="h2">Waiting for a confirmation</h2>
      <p className="muted">The Bitcoin network has the payment. It seals as soon as it lands in a block, usually within 10 to 30 minutes.</p>
      {b.lock?.txid && <a className="mono" style={{ color: 'inherit', wordBreak: 'break-all' }} href={explorerTx(b.network, b.lock.txid)} target="_blank" rel="noreferrer">{b.lock.txid} ↗</a>}
    </div>
  );
}

/* ---------- sealed and after ---------- */

function Locked({ b, reload }) {
  return (
    <div className="card ink stack">
      <div className="row between wrap-r"><span className="tag light">Sealed</span><span className="mono faint">{b.lock?.confirmations ?? 0} CONFIRMATIONS</span></div>
      <h2 className="h2">This bottle opens in</h2>
      <Countdown at={ms(b.unlockAt)} onZero={reload} dark />
      <div><span className="mono muted">OPENS</span><div style={{ fontSize: 20 }}>{fmtDay(b.unlockAt)} · {new Date(b.unlockAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}</div></div>
      {Date.now() >= ms(b.unlockAt) && <p className="muted">{CHAIN_CLOCK_NOTE}</p>}
      <hr className="divider" style={{ background: 'var(--color-graphite)' }} />
      <div className="row between wrap-r"><span><b>{fmtSats(b.amountSats)} sats</b> locked by Bitcoin</span><span className="muted">Message hidden</span></div>
    </div>
  );
}

function WaitingForClaim({ b }) {
  return (
    <div className="card stack">
      <span className="tag orange">Open</span>
      <h2 className="h2">Waiting for {b.recipientName} to claim</h2>
      <p className="muted">The date has passed. They can read your message and claim the sats from their link.</p>
    </div>
  );
}

function Claimed({ b }) {
  return (
    <div className="card ink stack">
      <span className="tag">Claimed</span>
      <h2 className="display" style={{ fontSize: 56 }}>Delivered.</h2>
      <p className="muted">{b.recipientName} claimed {fmtSats(b.amountSats)} sats. Updated {fmtDate(b.updatedAt)}.</p>
    </div>
  );
}

function SharePanel({ b }) {
  const saved = getSent(b.id);
  if (!saved?.shareUrl) {
    return <div className="card stack"><h2 className="h2">Share the bottle</h2><p className="muted">The share link was made on the device that sealed this bottle. Open this page there to share it.</p></div>;
  }
  const text = `${b.senderName || 'Someone'} sealed a bottle for you. It opens on ${fmtDay(b.unlockAt)}.`;
  return (
    <div className="card stack">
      <h2 className="h2">Share the bottle</h2>
      <div className="callout warn">Anyone with this link can open the bottle and claim the sats once it opens. Send it to {b.recipientName} privately.</div>
      <div className="grid g2" style={{ alignItems: 'center' }}>
        <QrBox text={saved.shareUrl} alt="QR code for the bottle link" />
        <div className="stack-sm">
          <div className="copybox"><code style={{ wordBreak: 'break-all' }}>{saved.shareUrl}</code></div>
          <div className="row wrap-r">
            <CopyButton text={saved.shareUrl} label="Copy link" />
            <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${saved.shareUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            {typeof navigator !== 'undefined' && navigator.share && <button className="btn btn-ghost btn-sm" onClick={() => navigator.share({ title: 'A bottle for you', text, url: saved.shareUrl }).catch(() => {})}>Share…</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LockDetails({ b }) {
  return (
    <details className="card stack-sm">
      <summary className="mono muted" style={{ cursor: 'pointer' }}>VERIFY IT YOURSELF</summary>
      <p className="body-sm muted">The sats sit in a Bitcoin script that only the recipient’s key can spend, and only after the locktime. Nobody else can move them, including us.</p>
      <span className="mono muted">ADDRESS ({b.network})</span><div className="copybox"><code style={{ wordBreak: 'break-all' }}>{b.lock.address}</code></div>
      <span className="mono muted">LOCKTIME</span><div className="mono">{b.lock.locktime} ({fmtDate(b.lock.locktime * 1000)})</div>
      <span className="mono muted">WITNESS SCRIPT</span><div className="copybox"><code style={{ wordBreak: 'break-all' }}>{b.lock.witnessScript}</code></div>
      {b.lock.txid && <><span className="mono muted">FUNDING TRANSACTION</span><a className="mono" style={{ wordBreak: 'break-all' }} href={explorerTx(b.network, b.lock.txid)} target="_blank" rel="noreferrer">{b.lock.txid}:{b.lock.vout} ↗</a></>}
    </details>
  );
}

function DevSkip({ b, reload }) {
  const { config } = useAuth();
  const { busy, error, run } = useAsync();
  if (!config?.devTools || b.status === 'draft' || b.status === 'claimed') return null;
  return (
    <div className="stack-sm">
      <button className="btn btn-mint btn-sm" disabled={busy} onClick={() => run(async () => { await api.devAdvance(b.id); await reload(); })}>{busy ? <Spinner /> : `Demo: skip to ${STATUS[{ awaiting_funding: 'funded', funded: 'sealed', sealed: 'unlockable', unlockable: 'claimed' }[b.status]].label.toLowerCase()}`}</button>
      <p className="help">Demo mode moves the status only. No coins move, so a skipped bottle has nothing to claim.</p>
      {error && <p className="err">{error.message}</p>}
    </div>
  );
}
