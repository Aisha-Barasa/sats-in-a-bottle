import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BottleRow from '../components/BottleRow.jsx';
import { Loading } from '../components/ui.jsx';
import { useBottles } from '../lib/useBottles.js';

const FILTERS = [
  ['all', 'All', () => true],
  ['locked', 'Locked', (b) => ['draft', 'awaiting_funding', 'funded', 'sealed'].includes(b.status)],
  ['open', 'Open', (b) => b.status === 'unlockable'],
  ['claimed', 'Claimed', (b) => b.status === 'claimed'],
];

export default function Bottles() {
  const [q, setQ] = useSearchParams();
  const tab = q.get('tab') === 'received' ? 'received' : 'sent';
  const [f, setF] = useState('all');
  const data = useBottles();
  if (!data) return <Loading />;
  const keep = FILTERS.find(([k]) => k === f)[2];
  const shown = data[tab].filter(keep);
  return (
    <div className="stack">
      <div className="page-head"><h1 className="display">Bottles</h1></div>
      <div className="row between wrap-r">
        <div className="seg" role="tablist" aria-label="Role">
          <button role="tab" aria-selected={tab === 'sent'} onClick={() => setQ({})}>My bottles</button>
          <button role="tab" aria-selected={tab === 'received'} onClick={() => setQ({ tab: 'received' })}>Received</button>
        </div>
        <div className="seg" aria-label="Filter">{FILTERS.map(([k, l]) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
      </div>
      <div className="stack-sm">{shown.map((b) => <BottleRow key={b.token || b.id} b={b} />)}</div>
      {!shown.length && <div className="card muted stack-sm" style={{ textAlign: 'center', padding: 48 }}>
        <span>Nothing here yet.</span>
        {tab === 'sent' ? <Link to="/create" className="alt-link">Create a bottle</Link> : <Link to="/find" className="alt-link">Open a link you were sent</Link>}
      </div>}
    </div>
  );
}
