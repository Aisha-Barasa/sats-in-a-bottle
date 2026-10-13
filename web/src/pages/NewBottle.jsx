import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, saveSent } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { isPubkey, newGiftKey, sealMessage } from '../lib/crypto.js';
import { OCCASIONS, fmtBtc, fmtDay, fmtKes, fmtSats, humanLeft, occasionLabel } from '../lib/format.js';
import { PhotoPicker, VoiceRecorder } from '../components/Media.jsx';
import { Spinner, useAsync } from '../components/ui.jsx';
import BottleCanvas from '../components/BottleCanvas.jsx';

// the bottle builds itself as you move through the steps
const STEP_PROGRESS = [0.14, 0.52, 0.68, 0.84, 1];
const STEPS = ['Who', 'Message', 'When', 'Amount', 'Seal'];
const HEADS = ['Who is it\nfor?', 'Your\nmessage', 'When does\nit open?', 'How much\ngoes in?', 'Seal the\nbottle'];
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const PRESETS = [['1 month', 30], ['6 months', 182], ['1 year', 365], ['5 years', 1826], ['18 years', 6575]];
const KES_AMOUNTS = [500, 1_000, 5_000, 10_000];
const SATS_AMOUNTS = [10_000, 50_000, 100_000, 500_000];
const MIN_LEAD_MS = 10 * 60_000;

function useKesQuote(kes, enabled) {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setQuote(null); setError('');
    if (!enabled || !kes) return;
    const t = setTimeout(() => {
      api.quoteKes(kes).then(setQuote).catch((e) => setError(e.message));
    }, 400);
    return () => clearTimeout(t);
  }, [kes, enabled]);
  return { quote, error };
}

export default function NewBottle() {
  const { config, start } = useAuth();
  const nav = useNavigate();
  const { busy, error, run, setError } = useAsync();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ recipientName: '', senderName: '', title: '', pubkey: '', message: '', occasion: 'birthday', at: '', kes: '', sats: '' });
  const [voice, setVoice] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [ack, setAck] = useState(false);
  const mpesa = Boolean(config?.fundingProvider);
  const [inKes, setInKes] = useState(true);
  const useKes = mpesa && inKes;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const at = f.at ? new Date(f.at) : null;
  const kes = Number(f.kes);
  const { quote, error: quoteError } = useKesQuote(useKes && step === 3 && Number.isInteger(kes) && kes >= 10 && kes <= 10_000 ? kes : 0, useKes);
  const sats = useKes ? quote?.sats ?? 0 : Number(f.sats);
  const minSats = config?.limits?.minSats ?? 1000;

  const problem = useMemo(() => {
    if (step === 0) {
      if (!f.recipientName.trim()) return 'Add the recipient’s name';
      if (!f.senderName.trim()) return 'Add your name, so they know who it is from';
      if (f.pubkey.trim() && !isPubkey(f.pubkey)) return 'That public key should be 66 characters starting with 02 or 03';
    }
    if (step === 1 && !f.message.trim() && !voice && !photo) return 'Add a letter, a voice note or a photo';
    if (step === 2) {
      if (!at || isNaN(at)) return 'Pick the day it opens';
      if (at.getTime() < Date.now() + MIN_LEAD_MS) return 'Pick a time at least 10 minutes from now';
    }
    if (step === 3) {
      if (useKes) {
        if (!Number.isInteger(kes) || kes < 10 || kes > 10_000) return 'M-Pesa top-ups are KES 10 to 10,000';
        if (!quote) return quoteError || 'Getting the rate…';
      }
      if (!Number.isInteger(sats) || sats < minSats) return `The minimum is ${fmtSats(minSats)} sats`;
    }
    if (step === 4 && !ack) return 'Tick the box to confirm';
    return '';
  }, [step, f, voice, photo, at, useKes, kes, quote, quoteError, sats, minSats, ack]);

  async function next() {
    if (problem) return setError(new Error(problem));
    setError(null);
    // The session starts here so the amount step can fetch live KES rates.
    if (step === 0 && !(await run(() => start(f.senderName.trim())))) return;
    setStep((s) => s + 1);
  }

  async function seal() {
    if (problem) return setError(new Error(problem));
    await run(async () => {
      await start(f.senderName.trim());
      // No wallet on their side: make a key for them and carry it in the link.
      const gift = f.pubkey.trim() ? null : newGiftKey();
      const bottle = await api.createBottle({
        title: f.title.trim() || `${occasionLabel(f.occasion)} for ${f.recipientName.trim()}`,
        recipientName: f.recipientName.trim(),
        senderName: f.senderName.trim(),
        occasion: f.occasion,
        amountSats: sats,
        unlockAt: at.toISOString(),
        recipientPubkey: gift ? gift.publicKey : f.pubkey.trim().toLowerCase(),
      });
      const sealed = await sealMessage({ text: f.message.trim(), voice, photo });
      await api.attachMessage(bottle.id, {
        type: voice ? 'voice' : photo ? 'photo' : 'text',
        objectRef: 'inline',
        ciphertext: sealed.ciphertext,
        encryptionMeta: { alg: 'AES-GCM-256', iv: sealed.iv, envelope: 1 },
      });
      const access = await api.issueAccess(bottle.id);
      const fragment = new URLSearchParams({ k: sealed.key, ...(gift ? { g: gift.privateKey } : {}) });
      saveSent(bottle.id, { shareUrl: `${access.url}#${fragment}`, token: access.token, kes: useKes ? kes : null });
      await api.prepareFunding(bottle.id);
      nav(`/b/${bottle.id}`);
    });
  }

  const presetAt = (days) => { const x = new Date(Date.now() + days * 864e5); x.setHours(12, 0, 0, 0); setF({ ...f, at: toLocalInput(x) }); };
  const tagBtn = { cursor: 'pointer', border: 0 };

  return (
    <div className="wiz">
      <div className="wiz-main stack">
        <div className="page-head"><span className="mono muted">NEW BOTTLE · STEP {step + 1}/{STEPS.length}</span><h1 className="display" style={{ marginTop: 8 }}>{HEADS[step].split('\n').map((l) => <span key={l} style={{ display: 'block' }}>{l}</span>)}</h1></div>
        <div className="wiz-bar" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((x, i) => <i key={x} className={i <= step ? 'on' : ''} />)}</div>

        <div className="stack wiz-body">
          {step === 0 && <>
            <label className="field"><span>Their name</span><input className="input" autoFocus maxLength={80} placeholder="Wangari" value={f.recipientName} onChange={set('recipientName')} /></label>
            <label className="field"><span>Your name</span><input className="input" maxLength={80} placeholder="Aunt Njoki" value={f.senderName} onChange={set('senderName')} /><div className="help">They see who it is from.</div></label>
            <label className="field"><span>Name this bottle (optional)</span><input className="input" maxLength={120} placeholder="For your 18th" value={f.title} onChange={set('title')} /></label>
            <details>
              <summary className="body-sm" style={{ cursor: 'pointer' }}>They already have a Bitcoin wallet</summary>
              <label className="field" style={{ marginTop: 12 }}><span>Their public key (optional)</span><input className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }} spellCheck={false} autoCapitalize="off" placeholder="02… or 03…" value={f.pubkey} onChange={set('pubkey')} />
                <div className="help">Leave empty and we make a key for them inside the share link, so they don’t need a wallet until they claim.</div></label>
            </details>
          </>}

          {step === 1 && <>
            <label className="field"><span>A letter</span><textarea className="textarea" autoFocus maxLength={5000} placeholder="Write something they’ll want to keep…" value={f.message} onChange={set('message')} /><div className="help" style={{ textAlign: 'right' }}>{f.message.length}/5000</div></label>
            <div className="grid g2"><VoiceRecorder value={voice} onChange={setVoice} /><PhotoPicker value={photo} onChange={setPhoto} /></div>
            <p className="help">Encrypted on this device. Nobody, including us, can read it before the day.</p>
          </>}

          {step === 2 && <>
            <span className="mono muted">OCCASION</span>
            <div className="row wrap-r">{OCCASIONS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.occasion === k} className={`tag ${f.occasion === k ? 'dark' : 'light'}`} style={tagBtn} onClick={() => setF({ ...f, occasion: k })}>{l}</button>)}</div>
            <label className="field"><span>Opens on</span><input className="input" type="datetime-local" min={toLocalInput(new Date())} value={f.at} onChange={set('at')} /></label>
            <div className="row wrap-r">
              {PRESETS.map(([l, d]) => <button key={l} type="button" className="tag light" style={tagBtn} onClick={() => presetAt(d)}>in {l}</button>)}
              {config?.devTools && <button type="button" className="tag yellow" style={tagBtn} onClick={() => setF({ ...f, at: toLocalInput(new Date(Date.now() + 15 * 60e3)) })}>in 15 min (demo)</button>}
            </div>
            {at && !isNaN(at) && <div className="card ink"><span className="mono faint">THIS BOTTLE WILL OPEN ON</span><div className="amount-big" style={{ marginTop: 8 }}>{fmtDay(at)}</div><div className="muted" style={{ marginTop: 8 }}>{at.toLocaleTimeString(undefined, { timeStyle: 'short' })} · in {humanLeft(at - Date.now())}</div></div>}
            <p className="help">Bitcoin enforces the date. Its clock runs about an hour behind, so it can open up to an hour after this time.</p>
          </>}

          {step === 3 && <>
            {mpesa && <div className="seg" role="tablist" style={{ alignSelf: 'flex-start' }}>
              <button role="tab" aria-selected={inKes} onClick={() => setInKes(true)}>Shillings (M-Pesa)</button>
              <button role="tab" aria-selected={!inKes} onClick={() => setInKes(false)}>Sats</button>
            </div>}
            {useKes ? <>
              <label className="field"><span>Amount in shillings</span><input className="input num" inputMode="numeric" autoFocus placeholder="1000" value={f.kes} onChange={(e) => setF({ ...f, kes: e.target.value.replace(/\D/g, '') })} /></label>
              <div className="row wrap-r">{KES_AMOUNTS.map((a) => <button key={a} type="button" className="tag light" style={tagBtn} onClick={() => setF({ ...f, kes: String(a) })}>{fmtKes(a)}</button>)}</div>
              <p className="help">Small amounts welcome. This isn’t about how much, it’s about when.</p>
            </> : <>
              <label className="field"><span>Amount in sats</span><input className="input num" inputMode="numeric" autoFocus placeholder="100000" value={f.sats} onChange={(e) => setF({ ...f, sats: e.target.value.replace(/\D/g, '') })} /></label>
              <div className="row wrap-r">{SATS_AMOUNTS.map((a) => <button key={a} type="button" className="tag light" style={tagBtn} onClick={() => setF({ ...f, sats: String(a) })}>{fmtSats(a)}</button>)}</div>
            </>}
            <div className="card mist sm row between wrap-r">
              <div><div className="amount-big num">{fmtSats(sats || 0)}</div><span className="mono muted">SATS GO IN THE BOTTLE</span></div>
              <div style={{ textAlign: 'right' }}><div className="h3 num">{fmtBtc(sats || 0)}</div><span className="mono muted">BTC</span></div>
            </div>
            {useKes && quote && <p className="help">Rate from {quote.provider}: {fmtKes(quote.kesAmount)} buys {fmtSats(quote.sats)} sats after a {fmtSats(quote.feeSats)}-sat fee. Rates move, so the final amount is set when you pay.</p>}
          </>}

          {step === 4 && <>
            <div className="grid g2">
              <div className="stack-sm">
                <span className="mono muted">TO</span><div>{f.recipientName} <span className="muted">from {f.senderName}</span></div>
                <span className="mono muted">OCCASION</span><div>{occasionLabel(f.occasion)}</div>
                <span className="mono muted">OPENS</span><div>{fmtDay(at)}, {at.toLocaleTimeString(undefined, { timeStyle: 'short' })}</div>
              </div>
              <div className="card ink"><span className="mono faint">AMOUNT</span><div className="amount-big num">{fmtSats(sats)}</div><span className="mono faint">SATS{useKes ? ` · ${fmtKes(kes)}` : ''}</span></div>
            </div>
            <div className="stack-sm"><span className="mono muted">MESSAGE</span><div className="letter" style={{ fontSize: 16, padding: 20, maxHeight: 220, overflow: 'auto' }}>{f.message || '(no letter)'}</div>
              <div className="row wrap-r">{voice && <span className="tag">Voice note</span>}{photo && <span className="tag">Photo</span>}</div></div>
            <div className="callout warn">Once it’s funded, nobody can move these sats before the date, not even you. There is no undo.</div>
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I understand. Seal it.</span></label>
          </>}

          {error && <p className="err" role="alert">{error.message}</p>}
          <div className="row between">
            <button className="btn btn-ghost" disabled={busy} onClick={() => { setError(null); step ? setStep(step - 1) : nav(-1); }}>Back</button>
            {step < 4
              ? <button className="btn btn-dark" disabled={busy} onClick={next}>{busy ? <Spinner /> : 'Continue'}</button>
              : <button className="btn btn-dark" onClick={seal} disabled={busy || !ack}>{busy ? <Spinner /> : 'Seal bottle'}</button>}
          </div>
        </div>
      </div>
      <div className="wiz-art"><BottleCanvas progress={STEP_PROGRESS[step]} zoom={0.9} /></div>
    </div>
  );
}
