import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Clipboard, Smartphone, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, type Bottle, type MpesaPayment, type MpesaQuote } from "@/lib/api";

const TERMINAL = new Set(["fulfilled", "failed", "payment_failed"]);

/** Owner-only: shows where to send sats, plus the optional M-Pesa -> Lightning top-up via Bitika. */
export function FundingPanel({ bottle, onChange }: { bottle: Bottle; onChange: () => void }) {
  const [pubkey, setPubkey] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const preparePubkey = async () => {
    setBusy(true);
    try {
      await api.setRecipientPubkey(bottle.id, pubkey.trim().toLowerCase());
      await api.prepareFunding(bottle.id);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare funding");
    } finally {
      setBusy(false);
    }
  };

  if (bottle.status === "draft") {
    const valid = /^0[23][0-9a-fA-F]{64}$/.test(pubkey.trim());
    return <section className="mt-12 border border-border bg-card p-6 sm:p-8">
      <p className="text-xs font-bold uppercase text-primary">Before funding</p>
      <h2 className="mt-2 font-display text-3xl">Add the recipient’s public key</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">The timelock address is built from their key and the opening date. Only their key can ever spend these sats.</p>
      <div className="mt-5 flex max-w-2xl flex-col gap-3 sm:flex-row"><Input value={pubkey} onChange={(e) => setPubkey(e.target.value)} placeholder="02… or 03… (66 characters)" className="h-12 font-mono text-sm" spellCheck={false}/><Button size="lg" disabled={!valid || busy} onClick={preparePubkey}>{busy ? "Preparing…" : "Get funding address"}</Button></div>
    </section>;
  }
  if (bottle.status !== "awaiting_funding" || !bottle.lock) return null;

  const btc = (bottle.amountSats / 1e8).toFixed(8);
  const bip21 = `bitcoin:${bottle.lock.address}?amount=${btc}`;
  const copy = async () => { await navigator.clipboard?.writeText(bottle.lock!.address); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  return <section className="mt-12 grid gap-8 border border-border bg-card p-6 sm:p-8 lg:grid-cols-2">
    <div>
      <p className="text-xs font-bold uppercase text-primary">Awaiting funding</p>
      <h2 className="mt-2 font-display text-3xl">Send {bottle.amountSats.toLocaleString()} sats to seal it</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Send from your own wallet on Bitcoin {bottle.network}. Network fees are paid on top by your wallet. This page updates once the transaction is seen on-chain.</p>
      <div className="mt-5 flex gap-5"><div className="shrink-0 bg-white p-2"><QRCodeSVG value={bip21} size={132}/></div><div className="min-w-0"><p className="text-xs text-muted-foreground">Timelock address</p><p className="mt-1 break-all font-mono text-sm">{bottle.lock.address}</p><Button className="mt-3" size="sm" variant="outline" onClick={copy}>{copied ? <Check/> : <Clipboard/>}{copied ? "Copied" : "Copy address"}</Button></div></div>
    </div>
    <MpesaTopUp bottle={bottle}/>
  </section>;
}

function MpesaTopUp({ bottle }: { bottle: Bottle }) {
  const [kes, setKes] = useState("500");
  const [phone, setPhone] = useState("");
  const [lnAddress, setLnAddress] = useState("");
  const [quote, setQuote] = useState<MpesaQuote | null>(null);
  const [payment, setPayment] = useState<MpesaPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // One key per payment attempt so a retried click can never double-charge.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!payment || TERMINAL.has(payment.status)) return;
    const timer = setInterval(async () => {
      try {
        setPayment(await api.mpesaStatus(bottle.id, payment.transactionCode));
      } catch {
        // Keep polling; transient errors are expected while M-Pesa settles.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [bottle.id, payment]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503 && /not enabled/.test(err.message)) setUnavailable(true);
      else toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (unavailable) return <div className="border-l border-border pl-0 text-sm text-muted-foreground lg:pl-8"><p className="font-bold text-foreground">M-Pesa top-up</p><p className="mt-2">Mobile-money funding is not enabled on this server.</p></div>;

  return <div className="lg:border-l lg:border-border lg:pl-8">
    <p className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground"><Smartphone className="size-4 text-primary"/> No sats yet? Buy with M-Pesa</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Bitika charges M-Pesa and sends sats to <strong>your</strong> Lightning wallet. You then send them on-chain to the address on the left.</p>
    {!payment ? <div className="mt-4 grid gap-3">
      <label className="text-sm font-bold">Amount (KES)<Input type="number" min="10" max="10000" value={kes} onChange={(e) => { setKes(e.target.value); setQuote(null); }} className="mt-1 h-11"/></label>
      <label className="text-sm font-bold">M-Pesa phone<Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className="mt-1 h-11" inputMode="tel"/></label>
      <label className="text-sm font-bold">Your Lightning address<Input value={lnAddress} onChange={(e) => setLnAddress(e.target.value)} placeholder="you@blink.sv" className="mt-1 h-11"/></label>
      {quote && <div className="flex justify-between border-y border-border py-3 text-sm"><span className="text-muted-foreground">You’ll receive</span><strong>{quote.sats.toLocaleString()} sats <span className="font-normal text-muted-foreground">(fee {quote.feeSats.toLocaleString()})</span></strong></div>}
      {quote && !quote.coversBottle && <p className="text-xs text-destructive">That’s less than the {quote.bottleAmountSats.toLocaleString()} sats this bottle needs.</p>}
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={() => run(async () => setQuote(await api.mpesaQuote(bottle.id, Number(kes))))}>Get quote</Button>
        <Button disabled={busy || !quote || !phone.trim() || !lnAddress.trim()} onClick={() => run(async () => setPayment(await api.mpesaPay(bottle.id, { kesAmount: Number(kes), phone, lightningAddress: lnAddress, idempotencyKey })))}><WalletCards/>{busy ? "Working…" : "Pay with M-Pesa"}</Button>
      </div>
    </div> : <div className="mt-4 border border-border p-4 text-sm">
      <div className="flex justify-between"><span className="text-muted-foreground">Bitika transaction</span><span className="font-mono">{payment.transactionCode}</span></div>
      <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Status</span><strong>{payment.status.replace(/_/g, " ")}</strong></div>
      <p className="mt-3 leading-6">{payment.nextStep}</p>
      {TERMINAL.has(payment.status) && payment.status !== "fulfilled" && <Button className="mt-3" size="sm" variant="outline" onClick={() => { setPayment(null); setIdempotencyKey(crypto.randomUUID()); }}>Try again</Button>}
    </div>}
  </div>;
}
