import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ensureSession, getSession } from './api.js';

// No passwords: a sender gets an anonymous session the first time they seal a bottle.
// Recipients never need one; their share link is their access.
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getSession());
  const [config, setConfig] = useState(null);

  useEffect(() => { api.health().then(setConfig).catch(() => setConfig({ ok: false })); }, []);

  const start = useCallback(async (name) => {
    const s = await ensureSession(name);
    setSession(s);
    return s;
  }, []);

  const value = useMemo(() => ({ session, config, ready: config !== null, start }), [session, config, start]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
