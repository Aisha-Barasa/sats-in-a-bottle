import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export const Brand = () => (
  <Link to="/" className="logo" aria-label="Sats in a Bottle home">
    <svg width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden="true"><path d="M8 1h6v6l4 5v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V12l4-5z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/><circle cx="11" cy="19" r="3" fill="currentColor"/></svg>
    <span>Sats in a Bottle</span>
  </Link>
);

export function Nav() {
  const { session } = useAuth();
  const loc = useLocation();
  const [dark, setDark] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [loc.pathname, loc.hash]);
  useEffect(() => { document.body.style.overflow = menu ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menu]);
  useEffect(() => { // header turns dark/orange while it floats over a black section
    let raf = 0;
    const check = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { setScrolled(window.scrollY > 8); setDark(document.elementsFromPoint(window.innerWidth / 2, 40).some((e) => e.closest?.('[data-dark]'))); }); };
    check(); const t = setTimeout(check, 150);
    window.addEventListener('scroll', check, { passive: true }); window.addEventListener('resize', check);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [loc.pathname]);

  const links = session
    ? <><NavLink to="/home" end>Home</NavLink><NavLink to="/bottles">Bottles</NavLink><NavLink to="/find">Find a bottle</NavLink></>
    : <><a href="/#how">How it works</a><a href="/#security">Security</a><a href="/#ideas">Ideas</a><NavLink to="/find">I received a bottle</NavLink></>;
  return (
    <header className={`hdr ${dark ? 'dark' : ''} ${scrolled ? 'scrolled' : ''}`}>
      <Brand />
      <nav className="pill" aria-label="Main">{links}</nav>
      <div className="hdr-right">
        <Link to="/create" className="hdr-cta">Create a bottle</Link>
        <button className="burger" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu((m) => !m)}><i /><i /></button>
      </div>
      {menu && <nav className="mnav" aria-label="Menu">{links}<Link to="/create">Create a bottle</Link></nav>}
    </header>
  );
}

export function Footer() {
  const { config } = useAuth();
  const network = config?.network && config.network !== 'mainnet' ? ` Running on Bitcoin ${config.network}: test coins only.` : '';
  return (
    <footer className="footer" data-dark>
      <div className="wrap foot-row">
        <Brand />
        <p>Bitcoin payments are irreversible. Not a bank, not insured.{network}</p>
      </div>
    </footer>
  );
}

/** Pages inside the app. `full` pages (the dashboard) run edge to edge. */
export function AppShell() {
  const loc = useLocation();
  const full = loc.pathname === '/home';
  return (<><Nav /><main className={full ? 'page-full' : 'wrap page'}><Outlet /></main><Footer /></>);
}
