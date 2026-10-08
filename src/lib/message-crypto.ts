/**
 * Client-side AES-GCM for bottle messages. The key lives only in the share
 * link's #fragment (never sent to servers) and in the sender's localStorage.
 */

const toB64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64Url = (value: string) => {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export async function encryptMessage(plaintext: string): Promise<{ ciphertext: string; iv: string; key: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { ciphertext: toB64Url(new Uint8Array(ciphertext)), iv: toB64Url(iv), key: toB64Url(rawKey) };
}

export async function decryptMessage(ciphertext: string, iv: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", fromB64Url(key), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64Url(iv) }, cryptoKey, fromB64Url(ciphertext));
  return new TextDecoder().decode(plaintext);
}

export function keyFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, "")).get("k");
}
