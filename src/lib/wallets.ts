/**
 * Wallet catalogue for the Sats in a Bottle demo.
 *
 * ============================================================
 * BACKEND / BITCOIN INTEGRATION POINT — WALLET CONNECTIONS
 * ------------------------------------------------------------
 * Nothing here talks to a real wallet yet. Each entry describes how the
 * real connection is expected to be wired later:
 *
 *  - Blink (blink.sv)   : GraphQL API + API key / OAuth. Exchange the key
 *                         server-side, never in the browser.
 *  - Bitnob             : REST API with a secret key. Must be proxied by a
 *                         server function (src/lib/wallet.functions.ts).
 *  - Wallet of Satoshi  : LNURL-auth / Lightning Address payment request.
 *  - Phoenix / Muun     : BIP-21 URI or deep link hand-off, on-chain funding.
 *  - Manual / node      : user pastes an address or signs a PSBT themselves.
 *
 * The real flow should be: create funding request on the server -> user pays
 * or signs -> backend watches the chain -> bottle state moves
 * Awaiting funding -> Funded -> Sealed. This app must never hold keys.
 * ============================================================
 */

export type WalletKind = "lightning" | "onchain" | "custodial" | "manual";

export type WalletOption = {
  id: string;
  name: string;
  tagline: string;
  kind: WalletKind;
  region: string;
  /** Short note about what the live integration will use. */
  integration: string;
  /** Flip to true once the real connector ships. */
  live: boolean;
};

export const WALLETS: WalletOption[] = [
  {
    id: "blink",
    name: "Blink",
    tagline: "Lightning wallet popular across Africa and LatAm",
    kind: "lightning",
    region: "Global",
    integration: "Blink GraphQL API key, exchanged on the server",
    live: false,
  },
  {
    id: "bitnob",
    name: "Bitnob",
    tagline: "Bitcoin savings and payouts for African users",
    kind: "custodial",
    region: "Africa",
    integration: "Bitnob REST API via a server function proxy",
    live: false,
  },
  {
    id: "wos",
    name: "Wallet of Satoshi",
    tagline: "Simple Lightning address payments",
    kind: "lightning",
    region: "Global",
    integration: "LNURL-pay to a Lightning address",
    live: false,
  },
  {
    id: "phoenix",
    name: "Phoenix",
    tagline: "Self-custodial Lightning, your keys",
    kind: "lightning",
    region: "Global",
    integration: "BIP-21 / deep-link hand-off",
    live: false,
  },
  {
    id: "muun",
    name: "Muun",
    tagline: "On-chain and Lightning in one recovery phrase",
    kind: "onchain",
    region: "Global",
    integration: "BIP-21 on-chain funding request",
    live: false,
  },
  {
    id: "manual",
    name: "Manual / my own node",
    tagline: "Pay an address or sign a PSBT yourself",
    kind: "manual",
    region: "Anywhere",
    integration: "Show funding address + PSBT download",
    live: false,
  },
];

export const walletById = (id: string | null) =>
  WALLETS.find((wallet) => wallet.id === id) ?? null;
