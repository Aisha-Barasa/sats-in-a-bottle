// Everything secret is made and used in the browser. The server only ever sees
// ciphertext and public keys; the keys travel in the share link's #fragment,
// which browsers never send to a server.
import * as secp from '@noble/secp256k1';

export const b64url = {
  encode(bytes) {
    let s = '';
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(text) {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};
export const toHex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

/* ---------- the message: letter + optional voice note + photo, sealed with AES-GCM-256 ---------- */

async function blobPart(blob) {
  if (!blob) return null;
  return { type: blob.type || 'application/octet-stream', data: b64url.encode(new Uint8Array(await blob.arrayBuffer())) };
}

/** Returns { ciphertext, iv, key } (base64url). `key` must never be sent to the server. */
export async function sealMessage({ text = '', voice = null, photo = null }) {
  const envelope = { v: 1, text, voice: await blobPart(voice), photo: await blobPart(photo) };
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const plain = new TextEncoder().encode(JSON.stringify(envelope));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return { ciphertext: b64url.encode(ct), iv: b64url.encode(iv), key: b64url.encode(rawKey) };
}

/** Returns { text, voice: Blob|null, photo: Blob|null }. Throws if the key is wrong or the data was changed. */
export async function openMessage({ ciphertext, iv, key }) {
  const k = await crypto.subtle.importKey('raw', b64url.decode(key), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64url.decode(iv) }, k, b64url.decode(ciphertext));
  const env = JSON.parse(new TextDecoder().decode(plain));
  const toBlob = (p) => (p ? new Blob([b64url.decode(p.data)], { type: p.type }) : null);
  return { text: env.text ?? '', voice: toBlob(env.voice), photo: toBlob(env.photo) };
}

/* ---------- the gift key: a secp256k1 key the timelock pays to ---------- */

/** A fresh key for the recipient. The public half goes to the server; the private half rides in the share link. */
export function newGiftKey() {
  const priv = secp.utils.randomPrivateKey();
  return { privateKey: b64url.encode(priv), publicKey: toHex(secp.getPublicKey(priv, true)) };
}

export const giftPublicKey = (privateKey) => toHex(secp.getPublicKey(b64url.decode(privateKey), true));

/** Signs the claim's 32-byte sighash; returns the 64-byte compact (low-S) signature as hex. */
export async function signClaim(sighashHex, privateKey) {
  const sig = await secp.signAsync(fromHex(sighashHex), b64url.decode(privateKey));
  return toHex(sig.toCompactRawBytes());
}

export const isPubkey = (hex) => /^0[23][0-9a-fA-F]{64}$/.test(hex.trim());
