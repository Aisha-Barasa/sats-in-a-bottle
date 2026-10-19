import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import PoppingCanvas from '../components/PoppingCanvas.jsx';
import { Blocks, INK, MINT, YEL } from '../components/Blocks.jsx';
import { Loading, StatusTag } from '../components/ui.jsx';
import { unlockLine, whoLine } from '../components/BottleRow.jsx';
import { fmtSats, humanLeft, ms } from '../lib/format.js';
import { bottleHref, useBottles } from '../lib/useBottles.js';

const TONES = { draft: ['#fff', '#fff', INK], awaiting_funding: ['#fff', MINT, INK], funded: [MINT, '#fff', INK], sealed: [INK, '#fff', MINT], unlockable: [YEL, '#fff', INK], claimed: [MINT, MINT, '#fff'] };

function BottleCard({ b, i }) {
  const cta = b.token && b.status === 'unlockable' ? 'Open it' : b.status === 'awaiting_funding' ? 'Fund it' : 'View';
  return (
    <Link to={bottleHref(b)} className="idea bcard">
      <div className="idea-art"><Blocks tones={TONES[b.status] || TONES.draft} size={104} delay={i * 3} reverse={i % 2 === 1} /></div>
      <div className="row between"><StatusTag status={b.status} /><span className="mono muted">{whoLine(b)}</span></div>
      <h3>{b.title}</h3>
      <div className="amt num">{fmtSats(b.amountSats)} <small>sats</small></div>
      <p>{unlockLine(b)}</p>
      <span className="btn-gray">{cta}</span>
    </Link>
  );
}

export default function Home() {
  const { session } = useAuth();
  const data = useBottles();
  if (!data) return <Loading />;
  const { sent, received } = data;
  const locked = sent.filter((b) => ['funded', 'sealed', 'unlockable'].includes(b.status)).reduce((s, b) => s + b.amountSats, 0);
  const waiting = received.filter((b) => b.status === 'unlockable');
  const next = sent.filter((b) => b.status === 'sealed').sort((a, b) => ms(a.unlockAt) - ms(b.unlockAt))[0];
  const line = waiting.length ? `${waiting.length} bottle${waiting.length > 1 ? 's are' : ' is'} ready to open.` : next ? `Your next bottle opens in ${humanLeft(ms(next.unlockAt) - Date.now())}.` : 'Nothing is waiting right now.';
  const name = session?.name && session.name !== 'Sender' ? session.name : 'there';
  return (
    <>
      <section className="hero dash">
        <div className="hero-art"><PoppingCanvas zoom={0.84} /></div>
        <div className="hero-copy">
          <h1 className="h-hero"><span>Hi,</span><span>{name}.</span></h1>
          <div className="dash-cta">
            <p className="hero-p">{line}</p>
            <div className="row wrap-r">
              {waiting.length > 0 && <Link to={bottleHref(waiting[0])} className="btn-dark-sm" style={{ background: 'var(--color-voltage-yellow)', color: '#000' }}>Open it now</Link>}
              <Link to="/create" className="btn-dark-sm">Create a bottle</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="dk arc" data-dark>
        <div className="wrap">
          <div className="cols3 stat3">
            <div><b className="num">{fmtSats(locked)}</b><span>Sats locked</span></div>
            <div><b className="num">{received.length}</b><span>Received</span></div>
            <div><b className="num">{sent.length}</b><span>Sent</span></div>
          </div>
        </div>
      </section>

      <section className="wh arc dash-list">
        <div className="wrap">
          <div className="row between wrap-r"><h2 className="h-sub">My bottles</h2><Link to="/bottles" className="alt-link">See all</Link></div>
          <div className="idea-grid">
            {sent.slice(0, 6).map((b, i) => <BottleCard key={b.id} b={b} i={i} />)}
            {!sent.length && <Link to="/create" className="idea bcard empty"><div className="idea-art"><Blocks model="cluster" size={104} /></div><h3>No bottles yet</h3><p>Seal your first one in about two minutes.</p><span className="btn-dark-sm">Create a bottle</span></Link>}
          </div>
          <div className="row between wrap-r" style={{ marginTop: 56 }}><h2 className="h-sub">Received</h2><Link to="/bottles?tab=received" className="alt-link">See all</Link></div>
          <div className="idea-grid">
            {received.slice(0, 6).map((b, i) => <BottleCard key={b.token} b={b} i={i + 1} />)}
            {!received.length && <Link to="/find" className="idea bcard empty"><div className="idea-art"><Blocks model="baby" size={104} /></div><h3>Nothing received yet</h3><p>Got a link from someone? Open it here.</p><span className="btn-gray">Find a bottle</span></Link>}
          </div>
        </div>
      </section>
    </>
  );
}
