// Client for the Express API in /server. In dev, Vite proxies /api to it.
const SESSION_KEY = 'sib.session';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Request failed');
    this.status = status;
    this.body = body;
  }
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: lives for this page only */ }
}

/** The sender's anonymous session: a bearer token kept in this browser only. */
export const getSession = () => readJson(SESSION_KEY, null);

export async function request(method, path, body, { auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = auth && getSession()?.token;
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try { res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, { error: 'Can’t reach the server. Check your connection.' }); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Returns the session, creating one the first time a sender seals a bottle. */
export async function ensureSession(displayName) {
  const existing = getSession();
  if (existing?.token) return existing;
  const r = await request('POST', '/session', { displayName: displayName || 'Sender' }, { auth: false });
  const session = { token: r.token, userId: r.userId, name: r.displayName };
  writeJson(SESSION_KEY, session);
  return session;
}

const enc = encodeURIComponent;
export const api = {
  health: () => request('GET', '/health', undefined, { auth: false }),
  quoteKes: (kesAmount) => request('GET', `/funding/quote?kesAmount=${enc(kesAmount)}`),

  createBottle: (b) => request('POST', '/bottles', b),
  listBottles: () => request('GET', '/bottles'),
  getBottle: (id) => request('GET', `/bottles/${enc(id)}`),
  attachMessage: (id, m) => request('PUT', `/bottles/${enc(id)}/message`, m),
  prepareFunding: (id) => request('POST', `/bottles/${enc(id)}/funding`),
  getFunding: (id) => request('GET', `/bottles/${enc(id)}/funding`),
  issueAccess: (id) => request('POST', `/bottles/${enc(id)}/access`),
  mpesaQuote: (id, kesAmount) => request('GET', `/bottles/${enc(id)}/funding/mpesa/quote?kesAmount=${enc(kesAmount)}`),
  mpesaPay: (id, body) => request('POST', `/bottles/${enc(id)}/funding/mpesa`, body),
  mpesaStatus: (id, code) => request('GET', `/bottles/${enc(id)}/funding/mpesa/${enc(code)}`),
  devAdvance: (id) => request('POST', `/dev/bottles/${enc(id)}/advance`),

  // Recipient side: the access token is the only credential.
  open: (token) => request('GET', `/access/${enc(token)}`, undefined, { auth: false }),
  redeem: (token) => request('POST', `/access/${enc(token)}/redeem`, {}, { auth: false }),
  claimPrepare: (token, address) => request('POST', `/access/${enc(token)}/claim/prepare`, { address }, { auth: false }),
  claim: (token, body) => request('POST', `/access/${enc(token)}/claim`, body, { auth: false }),
};

/* ---------- what this browser remembers ---------- */

const SENT_KEY = 'sib.bottles';
const RECEIVED_KEY = 'sib.received';

/** Per sent bottle: the share link, which carries the message key and gift key in its #fragment. */
export const getSent = (id) => readJson(SENT_KEY, {})[id] ?? null;
export function saveSent(id, value) {
  writeJson(SENT_KEY, { ...readJson(SENT_KEY, {}), [id]: value });
}

/** Bottles this browser has opened as a recipient, newest first. */
export const listReceived = () => readJson(RECEIVED_KEY, []);
export function rememberReceived(entry) {
  const rest = listReceived().filter((r) => r.token !== entry.token);
  writeJson(RECEIVED_KEY, [{ ...entry, savedAt: Date.now() }, ...rest].slice(0, 50));
}

/** Parses "/open/<token>#k=...&g=..." (full URL, path or bare token). */
export function parseShareLink(raw) {
  const text = String(raw || '').trim();
  const token = text.match(/(?:^|\/open\/)([A-Za-z0-9_-]{43})(?=$|[#?/])/)?.[1] ?? null;
  const hash = text.includes('#') ? new URLSearchParams(text.slice(text.indexOf('#') + 1)) : null;
  return { token, k: hash?.get('k') || null, g: hash?.get('g') || null };
}
