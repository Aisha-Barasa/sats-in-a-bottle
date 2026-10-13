import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError, api, listReceived, rememberReceived } from '../lib/api.js';
import { openMessage, signClaim } from '../lib/crypto.js';
import { CHAIN_CLOCK_NOTE, explorerTx, fmtBtc, fmtDay, fmtSats, ms, occasionLabel } from '../lib/format.js';
import BottleCanvas from '../components/BottleCanvas.jsx';
import { CopyButton, Countdown, Loading, Spinner, useAsync } from '../components/ui.jsx';

/** The recipient's view, reached through the share link: /open/<token>#k=<message key>&g=<gift key>. */
export default function OpenBottle() {
  const { token } = useParams();
  const { hash } = useLocation();
  const keys = useMemo(() => {
    const h = new URLSearchParams(hash.slice(1));
    const remembered = listReceived().find((r) => r.token === token);
    return { k: h.get('k') || remembered?.k || null, g: h.get('g') || remembered?.g || null };
  }, [hash, token]);
  const [b, setB] = useState(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try { setB(await api.open(token)); }
    catch (e) { if (e instanceof ApiError && e.status === 404) setMissing(true); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!b || b.status === 'claimed') return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [b?.status, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // so "Find a bottle" can list it later, even if the link is lost
    if (b) rememberReceived({ token, k: keys.k, g: keys.g, title: b.title, senderName: b.senderName, unlockAt: b.unlockAt });
  }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return <div className="center-screen"><div className="card stack" style={{ padding: 40 }}><h1 className="display">Link not found</h1><p className="muted">This bottle link is invalid or has expired. Check you copied all of it.</p><Link to="/find" className="btn btn-dark">Try another link</Link></div></div>;
  if (!b) return <Loading />;

  const from = b.senderName || 'Someone';
  const ready = b.status === 'unlockable' || b.status === 'claimed';
  return (
    <div className="stack">
      <div className="page-head stack-sm">
        <span className="tag yellow" style={{ alignSelf: 'flex-start' }}>From {from}</span>
        <h1 className="display">{b.title}</h1>
        <span className="mono muted">{b.occasion ? `${occasionLabel(b.occasion).toUpperCase()} · ` : ''}FOR {b.recipientName.toUpperCase()}</span>
      </div>
      {!keys.k && <div className="callout warn">This link is missing its key (the part after #). Without it the message can’t be read. Ask {from} for the full link.</div>}
      {ready ? <Reveal b={b} token={token} keys={keys} reload={load} /> : <Waiting b={b} reload={load} />}
    </div>
  );
}

function Waiting({ b, reload }) {
  const sealed = b.status === 'sealed';
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="hero-bottle bv-hero"><BottleCanvas zoom={0.88} progress={sealed ? 1 : 0.6} label="A sealed bottle" /></div>
      <div className="card ink stack">
        {sealed ? <>
          <h2 className="h2">Your bottle opens in</h2>
          <Countdown at={ms(b.unlockAt)} onZero={reload} dark />
          <div><span className="mono muted">OPENS</span><div style={{ fontSize: 20 }}>{fmtDay(b.unlockAt)}</div></div>
          <p className="muted">{Date.now() >= ms(b.unlockAt) ? CHAIN_CLOCK_NOTE : `Sealed by a Bitcoin timelock. Nobody can open it early, not even ${b.senderName || 'the sender'}.`}</p>
        </> : <>
          <h2 className="h2">On its way</h2>
          <p className="muted">{b.senderName || 'The sender'} is still sealing this bottle. Check back soon; this page updates on its own.</p>
        </>}
        <hr className="divider" style={{ background: 'var(--color-graphite)' }} />
        <div className="row between wrap-r"><span><b>{fmtSats(b.amountSats)} sats</b> inside</span><span className="muted">Message hidden</span></div>
      </div>
    </div>
  );
}

function Reveal({ b, token, keys, reload }) {
  const [msg, setMsg] = useState(null);
  const [pop, setPop] = useState(0);
  const { busy, error, run } = useAsync();
  const urls = useMemo(() => msg && { voice: msg.voice && URL.createObjectURL(msg.voice), photo: msg.photo && URL.createObjectURL(msg.photo) }, [msg]);
  useEffect(() => () => { if (urls?.voice) URL.revokeObjectURL(urls.voice); if (urls?.photo) URL.revokeObjectURL(urls.photo); }, [urls]);

  const openIt = () => run(async () => {
    await api.redeem(token);
    if (!b.message?.ciphertext) throw new Error('This bottle has no message inside.');
    if (!keys.k) throw new Error('The link is missing its key, so the message can’t be read.');
    try {
      setMsg(await openMessage({ ciphertext: b.message.ciphertext, iv: b.message.encryptionMeta.iv, key: keys.k }));
    } catch {
      throw new Error('This key doesn’t open the message. Check you have the full link.');
    }
    setPop(1);
  });

  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="hero-bottle bv-hero"><BottleCanvas zoom={0.88} progress={1} open={pop} label={pop ? 'The bottle has opened' : 'A bottle ready to open'} /></div>
      <div className="stack">
        {!msg ? <div className="card ink stack">
          <span className="tag yellow">Ready</span>
          <h2 className="display" style={{ fontSize: 56 }}>The day is here.</h2>
          <p className="muted">{b.senderName || 'Someone'} left you a message and {fmtSats(b.amountSats)} sats.</p>
          {error && <p className="err" role="alert">{error.message}</p>}
          <button className="btn btn-light btn-block" style={{ minHeight: 64, fontSize: 18 }} disabled={busy} onClick={openIt}>{busy ? <Spinner /> : 'Open the bottle'}</button>
        </div> : <>
          {msg.text && <div className="letter letter-anim">{msg.text}</div>}
          {(urls.photo || urls.voice) && <div className="card stack-sm media">
            {urls.photo && <img src={urls.photo} alt={`Photo from ${b.senderName || 'the sender'}`} />}
            {urls.voice && <><span className="mono muted">VOICE NOTE</span><audio controls preload="metadata" src={urls.voice} /></>}
          </div>}
          <div className="card ink"><span className="mono faint">ATTACHED</span><div className="amount-big num" style={{ marginTop: 8 }}>{fmtSats(b.amountSats)} <span style={{ fontSize: '.4em' }}>SATS</span></div><span className="mono faint">{fmtBtc(b.amountSats)} BTC</span></div>
          {b.status === 'claimed' ? <div className="callout">These sats have been claimed.</div>
            : keys.g ? <ClaimPanel b={b} token={token} giftKey={keys.g} reload={reload} />
              : <OwnWalletClaim b={b} />}
        </>}
      </div>
    </div>
  );
}

function ClaimPanel({ b, token, giftKey, reload }) {
  const [address, setAddress] = useState('');
  const [prep, setPrep] = useState(null);
  const [ack, setAck] = useState(false);
  const [txid, setTxid] = useState('');
  const { busy, error, run, setError } = useAsync();
  const prefix = b.network === 'mainnet' ? 'bc1' : 'tb1';

  if (txid) return (
    <div className="card stack">
      <span className="tag">Sent</span>
      <h2 className="h2">The sats are on their way</h2>
      <p className="muted">{fmtSats(prep.receiveSats)} sats go to your wallet once the transaction confirms, usually within 30 minutes.</p>
      <span className="mono muted">TRANSACTION</span>
      <div className="copybox"><code style={{ wordBreak: 'break-all' }}>{txid}</code><CopyButton text={txid} /></div>
      <a className="btn btn-ghost btn-sm" href={explorerTx(b.network, txid)} target="_blank" rel="noreferrer">See it on mempool.space</a>
    </div>
  );

  return (
    <div className="card stack">
      <h2 className="h2">Claim your sats</h2>
      {!prep ? <>
        <p className="muted body-sm">Paste a Bitcoin address from any wallet you own. To turn sats into shillings, use a wallet or exchange that pays out to M-Pesa.</p>
        <label className="field"><span>Your Bitcoin address</span>
          <input className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }} spellCheck={false} autoCapitalize="off" autoComplete="off" placeholder={`${prefix}q…`} value={address} onChange={(e) => { setAddress(e.target.value.trim()); setError(null); }} /></label>
        {error && <p className="err" role="alert">{error.message}</p>}
        <button className="btn btn-dark" disabled={busy || address.length < 14} onClick={() => run(async () => setPrep(await api.claimPrepare(token, address)))}>{busy ? <Spinner /> : 'Continue'}</button>
      </> : <>
        <div className="card ink"><span className="mono faint">YOU RECEIVE</span><div className="amount-big num">{fmtSats(prep.receiveSats)}</div><span className="mono faint">SATS AFTER A {fmtSats(prep.feeSats)}-SAT NETWORK FEE</span></div>
        <span className="mono muted">TO</span><div className="copybox"><code style={{ wordBreak: 'break-all' }}>{prep.address}</code></div>
        <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>This address is mine. Bitcoin payments can’t be reversed.</span></label>
        {error && <p className="err" role="alert">{error.message}</p>}
        <div className="row">
          <button className="btn btn-ghost" disabled={busy} onClick={() => { setPrep(null); setAck(false); setError(null); }}>Back</button>
          <button className="btn btn-dark" disabled={!ack || busy} onClick={() => run(async () => {
            // Signed here with the key from the link; the server only checks and relays it.
            const signature = await signClaim(prep.sighash, giftKey);
            const r = await api.claim(token, { address: prep.address, feeSats: prep.feeSats, signature });
            setTxid(r.txid);
            reload();
          })}>{busy ? <Spinner /> : 'Claim sats'}</button>
        </div>
      </>}
    </div>
  );
}

/** The sender used the recipient's own public key, so the recipient claims from their own wallet. */
function OwnWalletClaim({ b }) {
  const lock = b.lock;
  return (
    <div className="card stack-sm">
      <h2 className="h2">Claim from your wallet</h2>
      <p className="muted body-sm">This bottle was locked to your own Bitcoin key. Spend it from a wallet that supports custom scripts (for example Sparrow) with these details.</p>
      {lock?.txid ? <>
        <span className="mono muted">COIN</span><div className="copybox"><code style={{ wordBreak: 'break-all' }}>{lock.txid}:{lock.vout}</code></div>
        <span className="mono muted">WITNESS SCRIPT</span><div className="copybox"><code style={{ wordBreak: 'break-all' }}>{lock.witnessScript}</code><CopyButton text={lock.witnessScript} /></div>
        <span className="mono muted">NLOCKTIME</span><div className="mono">{lock.locktime} (set sequence below 0xffffffff)</div>
      </> : <p className="muted">No on-chain payment was found for this bottle yet.</p>}
    </div>
  );
}
