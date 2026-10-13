/**
 * Client for the Sats in a Bottle API (server/). Browser-only: every call
 * reads the sender token from localStorage, so never call these during SSR.
 */

export const API_URL = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:4000").replace(/\/+$/, "");

export type BottleStatus = "draft" | "awaiting_funding" | "funded" | "sealed" | "unlockable" | "claimed";

export type BitcoinLockInfo = {
  network: string;
  address: string;
  locktime: number;
  witnessScript: string;
  txid: string | null;
  vout: number | null;
  amountSats: number | null;
  confirmations: number;
};

export type EncryptedMessage = {
  type: "text" | "voice" | "photo";
  objectRef: string;
  ciphertext: string | null;
  encryptionMeta: { alg: string; iv: string };
};

export type Bottle = {
  id: string;
  title: string;
  recipientName: string;
  recipientPubkey?: string | null;
  status: BottleStatus;
  amountSats: number;
  unlockAt: string;
  network: string;
  hasMessage: boolean;
  lock: BitcoinLockInfo | null;
  message?: EncryptedMessage | null;
};

export type FundingDetails = {
  status: BottleStatus;
  network: string;
  address: string;
  amountSats: number;
  locktime: number;
  unlockAt: string;
  witnessScript: string;
  bip21: string;
  txid: string | null;
  confirmations: number;
};

export type MpesaQuote = {
  kesAmount: number;
  sats: number;
  feeSats: number;
  bottleAmountSats: number;
  coversBottle: boolean;
};

export type MpesaPayment = {
  transactionCode: string;
  status: "processing" | "processing_payment" | "fulfilled" | "failed" | "payment_failed";
  sats?: number | null;
  lockAddress: string;
  nextStep: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SESSION_KEY = "sib.session";
const BOTTLES_KEY = "sib.bottles";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / storage disabled: the bottle still exists server-side.
  }
}

export function getSessionToken(): string | null {
  return read<{ token: string }>(SESSION_KEY)?.token ?? null;
}

/** Message key + share link, kept only in this browser. The server never sees the key. */
export type LocalBottle = { key: string; shareUrl: string };

export function getLocalBottle(id: string): LocalBottle | null {
  return read<Record<string, LocalBottle>>(BOTTLES_KEY)?.[id] ?? null;
}

export function saveLocalBottle(id: string, value: LocalBottle) {
  write(BOTTLES_KEY, { ...(read<Record<string, LocalBottle>>(BOTTLES_KEY) ?? {}), [id]: value });
}

async function request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth !== false) {
    const token = getSessionToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? null : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the Sats in a Bottle server. Your funds are unaffected; try again shortly.");
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export async function ensureSession(displayName = "Sender"): Promise<string> {
  const existing = getSessionToken();
  if (existing) return existing;
  const session = await request<{ token: string }>("/api/session", { method: "POST", body: { displayName }, auth: false });
  write(SESSION_KEY, { token: session.token });
  return session.token;
}

export const api = {
  createBottle: (body: { title: string; recipientName: string; amountSats: number; unlockAt: string; recipientPubkey?: string }) =>
    request<Bottle>("/api/bottles", { method: "POST", body }),
  listBottles: () => request<Bottle[]>("/api/bottles"),
  getBottle: (id: string) => request<Bottle>(`/api/bottles/${encodeURIComponent(id)}`),
  setRecipientPubkey: (id: string, recipientPubkey: string) =>
    request<Bottle>(`/api/bottles/${encodeURIComponent(id)}`, { method: "PATCH", body: { recipientPubkey } }),
  attachMessage: (id: string, message: Omit<EncryptedMessage, "ciphertext"> & { ciphertext?: string }) =>
    request<Bottle>(`/api/bottles/${encodeURIComponent(id)}/message`, { method: "PUT", body: message }),
  prepareFunding: (id: string) => request<FundingDetails>(`/api/bottles/${encodeURIComponent(id)}/funding`, { method: "POST" }),
  getFunding: (id: string) => request<FundingDetails>(`/api/bottles/${encodeURIComponent(id)}/funding`),
  issueAccess: (id: string) => request<{ token: string; url: string }>(`/api/bottles/${encodeURIComponent(id)}/access`, { method: "POST" }),

  mpesaQuote: (id: string, kesAmount: number) =>
    request<MpesaQuote>(`/api/bottles/${encodeURIComponent(id)}/funding/mpesa/quote?kesAmount=${kesAmount}`),
  mpesaPay: (id: string, body: { kesAmount: number; phone: string; lightningAddress: string; idempotencyKey: string }) =>
    request<MpesaPayment>(`/api/bottles/${encodeURIComponent(id)}/funding/mpesa`, { method: "POST", body }),
  mpesaStatus: (id: string, code: string) =>
    request<MpesaPayment>(`/api/bottles/${encodeURIComponent(id)}/funding/mpesa/${encodeURIComponent(code)}`),

  getByAccessToken: (token: string) => request<Bottle>(`/api/access/${encodeURIComponent(token)}`, { auth: false }),
  redeem: (token: string) => request<{ ok: true }>(`/api/access/${encodeURIComponent(token)}/redeem`, { method: "POST", auth: false }),
};

/** Recipient share tokens are 43-char base64url; owner bottle ids are shorter cuids. */
export function isAccessToken(id: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(id);
}

export const STATUS_LABEL: Record<BottleStatus, string> = {
  draft: "Draft",
  awaiting_funding: "Awaiting funding",
  funded: "Funded",
  sealed: "Sealed",
  unlockable: "Unlockable",
  claimed: "Claimed",
};

export function explorerTxUrl(network: string, txid: string): string {
  const prefix = network === "mainnet" ? "" : `/${network === "testnet" ? "testnet4" : network}`;
  return `https://mempool.space${prefix}/tx/${txid}`;
}
