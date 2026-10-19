import { useEffect, useState } from 'react';
import { api, getSession, listReceived } from './api.js';

/**
 * Bottles this browser knows about: the ones this sender sealed (from the API)
 * and the ones opened here as a recipient (by their access tokens).
 */
export function useBottles() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    const sent = getSession() ? api.listBottles().catch(() => []) : Promise.resolve([]);
    const received = Promise.all(
      listReceived().slice(0, 24).map((r) => api.open(r.token).then((b) => ({ ...b, token: r.token })).catch(() => null)),
    ).then((list) => list.filter(Boolean));
    Promise.all([sent, received]).then(([s, r]) => live && setData({ sent: s, received: r }));
    return () => { live = false; };
  }, []);
  return data;
}

/** Where a bottle card links to, depending on which side of it this browser is on. */
export const bottleHref = (b) => (b.token ? `/open/${b.token}` : `/b/${b.id}`);
