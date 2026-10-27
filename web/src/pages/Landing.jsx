import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BottleCanvas from '../components/BottleCanvas.jsx';
import { Footer, Nav } from '../components/Layout.jsx';
import { useReveal } from '../components/ui.jsx';
import { Blocks } from '../components/Blocks.jsx';

const INTRO_MS = 5200;                  // first play, scroll locked
const LOOP = { hold: 1400, open: 2000, rest: 1300, fade: 350, build: 4200 }; // then it repeats

const TRIO = [
  ['Message', 'A letter, a voice note or a photo. Only they can see it, and only on the day.', ['#d1ffca', '#fff', '#000']],
  ['Amount', 'Start with a few hundred shillings. Pay with M-Pesa or bitcoin.', ['#f7931a', '#fff', '#000']],
  ['Date', 'A birthday, a graduation, or any day you choose.', ['#fff', '#d1ffca', '#f7931a']],
];
const IDEAS = [
  ['Birthdays', 'Write it now. They open it on the day.', 'cake'],
  ['Graduation', 'Ready for the day they finish school.', 'cap'],
  ['New baby', 'A gift they can open when they turn 18.', 'baby'],
];

export default function Landing() {
  const sceneRef = useRef(null);
  const [done, setDone] = useState(false);
  const raf = useRef(0);
  const skipRef = useRef(() => {});
  const r1 = useReveal(), r2 = useReveal(), r3 = useReveal(), r4 = useReveal();

  const finish = useCallback(() => setDone(true), []);

  useEffect(() => { // build the bottle (scroll locked), then loop: open, rewind, build again
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; // still animates (it is decorative), just never locks scrolling
    const skipIntro = reduced || !!window.location.hash || window.scrollY > 200; // arriving at a section link: no intro
    let start = performance.now() + 500, phase = skipIntro ? 'hold' : 'intro', skipped = false;
    if (skipIntro) {
      finish();
      const hash = window.location.hash;
      const go = () => { // land with the section's top just below the 72px header
        sceneRef.current?.jumpTo(1);
        const el = hash && document.querySelector(hash);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'instant' });
      };
      [150, 600, 1400].forEach((t) => setTimeout(go, t));
    }
    const sc = () => sceneRef.current;
    const fade = (v) => { const c = sc()?.canvas; if (c) { c.style.transition = 'opacity .3s'; c.style.opacity = v; } };
    skipRef.current = () => { skipped = true; };
    const tick = (now) => {
      raf.current = requestAnimationFrame(tick);
      const e = now - start;
      if (e < 0) return;
      if (phase === 'intro') {
        const t = skipped ? 1 : e / INTRO_MS;
        sc()?.setProgress(Math.min(1, t));
        if (t >= 1) { setDone(true); phase = 'hold'; start = now; }
      } else if (phase === 'build') {
        sc()?.setProgress(Math.min(1, e / LOOP.build));
        if (e > LOOP.build) { phase = 'hold'; start = now; }
      } else if (phase === 'hold') {
        if (e > LOOP.hold) { phase = 'open'; start = now; sc()?.setOpen(1); }
      } else if (phase === 'open') {
        if (e > LOOP.open + LOOP.rest) { phase = 'fade'; start = now; fade(0); }
      } else if (e > LOOP.fade) { sc()?.jumpOpen(0); sc()?.jumpTo(0); fade(1); phase = 'build'; start = now; }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [finish]);

  useEffect(() => { // no scrolling until the first play has finished
    const lock = !done;
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    document.body.style.overflow = lock ? 'hidden' : '';
    if (lock) window.scrollTo(0, 0);
    return () => { document.documentElement.style.overflow = ''; document.body.style.overflow = ''; };
  }, [done]);

  return (
    <>
      <Nav />
      <section className="hero">
        <div className="hero-art">
          <BottleCanvas progress={0} offset={0} zoom={0.84} onReady={(s) => { sceneRef.current = s; s.jumpTo(window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.location.hash || window.scrollY > 200 ? 1 : 0); }} />
        </div>
        <div className="hero-copy">
          <h1 className="h-hero">
            <span>Send money</span><span>and a message</span><span>that opens on</span><span>a day you pick.</span>
          </h1>
          <p className="hero-p">Write a letter or record a voice note, add money with M-Pesa, and choose the day. Until then, nobody can open it or spend the money. Not even you.</p>
        </div>
        {!done && <button className="skip-link" onClick={() => skipRef.current()}>Skip</button>}
      </section>

      <section className="dk arc" id="how" data-dark>
        <div className="wrap" ref={r1}>
          <div className="cols3 reveal">
            {[['Write.', 'Write a letter or record a voice note. Choose who it is for and the day it opens.'],
              ['Lock.', 'Add money with M-Pesa or bitcoin. It stays locked in the bottle until that day.'],
              ['Open.', 'On the day, they read your message and move the money to their own wallet.']].map(([t, d]) => (
              <div key={t}><h2 className="h-col">{t}</h2><p className="p-dk">{d}</p></div>))}
          </div>
          <h2 className="h-statement reveal">Money that waits for the right day.</h2>
          <div className="p-stack reveal"><p>You choose the amount, the day and the words.</p><p>Once it is sealed, nothing can be changed or taken out early.</p><p>Made for Kenyans abroad who send money home and want to send a moment with it.</p></div>
        </div>
      </section>

      <section className="dk" data-dark>
        <div className="wrap" ref={r2}>
          <div className="cols3 trio reveal">
            {TRIO.map(([t, d, tones]) => (
              <div key={t}><Blocks tones={tones} size={170} delay={TRIO.findIndex((x) => x[0] === t) * 3} reverse={t === 'Amount'} /><h2 className="h-col">{t}</h2><p className="p-dk">{d}</p></div>))}
          </div>
        </div>
      </section>

      <section className="dk" id="security" data-dark>
        <div className="wrap" ref={r3}>
          <h2 className="h-statement reveal">Why you can trust it.</h2>
          <div className="cols3 reveal">
            {[['Private.', 'Your message is locked on your device before it is sent. We cannot read it.'],
              ['Locked.', 'Bitcoin itself keeps the date, not us. Nobody can open it early.'],
              ['Yours.', 'We never hold the money. It goes from the bottle straight to their wallet.']].map(([t, d]) => (
              <div key={t}><h2 className="h-col">{t}</h2><p className="p-dk">{d}</p></div>))}
          </div>
          <p className="p-dk fine reveal">Anyone with the link can open the bottle on the day, so send it only to them. Once you add money, it cannot be undone.</p>
        </div>
      </section>

      <section className="wh arc" id="ideas">
        <div className="wrap" ref={r4}>
          <h2 className="h-sub reveal">Ideas for your first bottle.</h2>
          <p className="p-gray reveal">Pick a reason, choose a day, send it.</p>
          <div className="feature reveal">
            <div className="feature-copy">
              <h3 className="h-feature">Birthdays that arrive on time.</h3>
              <p>Write it today. They open it on their birthday, not a day before.</p>
              <Link to="/create" className="btn-dark-sm">Create one</Link>
            </div>
            <div className="feature-art"><Blocks model="cake" size={270} /></div>
          </div>
        </div>
      </section>

      <section className="cards-sec">
        <div className="wrap idea-grid">
          {IDEAS.map(([t, d, model], i) => (
            <article className="idea" key={t}>
              <div className="idea-art"><Blocks model={model} size={118} delay={i * 4} reverse={i === 1} /></div>
              <h3>{t}</h3><p>{d}</p>
              <Link to="/create" className="btn-gray">Create one</Link>
            </article>))}
        </div>
      </section>

      <section className="split">
        <Link to="/create" className="split-half"><h2 className="h-split">Create<br />a bottle</h2><span className="arrow-box" aria-hidden="true">↗</span><p>Takes about two minutes.</p></Link>
        <Link to="/find" className="split-half"><h2 className="h-split">I received<br />a bottle</h2><span className="arrow-box" aria-hidden="true">↗</span><p>Open the link someone sent you.</p></Link>
      </section>
      <Footer />
    </>
  );
}
