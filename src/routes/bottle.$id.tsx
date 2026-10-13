import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Clipboard, Clock3, ExternalLink, Gift, LockKeyhole, QrCode, Share2, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FundingPanel } from "@/components/funding-panel";
import { api, explorerTxUrl, getLocalBottle, getSessionToken, isAccessToken, STATUS_LABEL, type Bottle } from "@/lib/api";
import { decryptMessage, keyFromHash } from "@/lib/message-crypto";
import bottleImage from "@/assets/gold-message-bottle.jpg";

export const Route = createFileRoute("/bottle/$id")({
  head: () => ({ meta: [
    { title: "A Sealed Bottle — Sats in a Bottle" }, { name: "description", content: "A meaningful message and sats are waiting for the right moment." },
    { property: "og:title", content: "A Sealed Bottle — Sats in a Bottle" }, { property: "og:description", content: "A meaningful message and sats are waiting for the right moment." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}), component: BottleDetail,
});

// Sample bottles linked from the dashboard when there is no real data yet.
const DEMO_IDS = new Set(["ama-2030", "mama-2026", "kwame-draft", "new-bottle"]);
const OPEN_STATES = new Set(["unlockable", "claimed"]);

function useLiveBottle(id: string) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const recipient = isAccessToken(id);
  const enabled = mounted && !DEMO_IDS.has(id) && (recipient || Boolean(getSessionToken()));
  const query = useQuery({
    queryKey: ["bottle", id],
    queryFn: () => (recipient ? api.getByAccessToken(id) : api.getBottle(id)),
    enabled,
    refetchInterval: 15_000,
    retry: false,
  });
  const local = mounted && !recipient ? getLocalBottle(id) : null;
  const key = mounted ? (recipient ? keyFromHash(window.location.hash) : local?.key ?? null) : null;
  const shareUrl = recipient ? (mounted ? window.location.href : null) : local?.shareUrl ?? null;
  return { query, enabled, mounted, recipient, key, shareUrl };
}

function useCountdown(target: Date) {
  // Starts after mount so server and client render the same placeholder.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now === null) return [["–", "days"], ["–", "hours"], ["–", "mins"], ["–", "secs"]];
  const s = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return [[Math.floor(s / 86400).toLocaleString(), "days"], [pad(Math.floor(s / 3600) % 24), "hours"], [pad(Math.floor(s / 60) % 60), "mins"], [pad(s % 60), "secs"]];
}

function BottleDetail() {
  const { id } = Route.useParams();
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const { query, enabled, mounted, recipient, key, shareUrl } = useLiveBottle(id);
  const live: Bottle | undefined = query.data;

  const isReady = live ? OPEN_STATES.has(live.status) : id === "mama-2026";
  const unlockAt = live ? new Date(live.unlockAt) : new Date("2030-06-18T12:00:00");
  const countdown = useCountdown(unlockAt);
  const sats = live ? (live.lock?.amountSats ?? live.amountSats) : isReady ? 48_000 : 125_000;
  const network = live ? live.network.charAt(0).toUpperCase() + live.network.slice(1) : "Signet";
  const preFunding = live && ["draft", "awaiting_funding", "funded"].includes(live.status);

  const copy = async () => { await navigator.clipboard?.writeText(shareUrl ?? window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  const open = async () => {
    if (live) {
      // Owners read their own ciphertext through the recipient token saved in their share link.
      const ownerToken = !recipient ? shareUrl?.match(/\/bottle\/([A-Za-z0-9_-]{43})/)?.[1] : undefined;
      const message = live.message ?? (ownerToken ? (await api.getByAccessToken(ownerToken).catch(() => null))?.message : null);
      if (message?.ciphertext && key) {
        setPlaintext(await decryptMessage(message.ciphertext, message.encryptionMeta.iv, key).catch(() => null));
      }
      if (recipient) void api.redeem(id).catch(() => undefined);
    }
    setRevealed(true);
  };

  if (!DEMO_IDS.has(id) && (!mounted || (enabled && query.isPending))) return <main className="mx-auto max-w-4xl px-5 py-24 text-center text-muted-foreground">Finding your bottle…</main>;
  if (mounted && !DEMO_IDS.has(id) && !live) {
    return <main className="mx-auto max-w-xl px-5 py-24 text-center"><LockKeyhole className="mx-auto size-8 text-primary"/><h1 className="mt-5 font-display text-4xl">We couldn’t open this bottle</h1><p className="mt-3 text-muted-foreground">{query.error?.message ?? "This bottle link is invalid or has expired."}</p><p className="mt-2 text-sm text-muted-foreground">Any sats already locked on-chain stay protected by Bitcoin’s rules, whatever this page shows.</p><Button asChild className="mt-8" variant="outline"><Link to="/dashboard">My bottles</Link></Button></main>;
  }

  if (revealed) return <main className="mx-auto max-w-4xl px-5 py-16 text-center"><Sparkles className="mx-auto size-8 text-primary"/><p className="mt-5 text-xs font-bold uppercase text-primary">The moment is here</p><h1 className="mt-3 font-display text-5xl sm:text-6xl">{live ? live.title : "For all the love you gave us."}</h1><blockquote className="mx-auto mt-10 max-w-2xl whitespace-pre-line border-y border-border py-10 font-display text-2xl leading-relaxed">{live ? (plaintext !== null ? `“${plaintext}”` : "This message can’t be decrypted on this device. Open the bottle from the original share link, which carries the key.") : "“Mum, this is a small piece of tomorrow for all the years you gave us today. Happy birthday. We love you.”"}</blockquote><div className="mx-auto mt-10 max-w-md border border-border bg-card p-6 text-left"><p className="text-xs font-bold uppercase text-muted-foreground">{live?.status === "claimed" ? "Claimed" : "Ready to claim"}</p><p className="mt-2 font-display text-4xl">{sats.toLocaleString()} sats</p>{live?.lock ? <><p className="mt-3 text-sm leading-6 text-muted-foreground">Sign the claim with a wallet that supports custom scripts (e.g. Sparrow) using your private key. This app never holds it.</p><dl className="mt-4 space-y-2 break-all text-xs"><div><dt className="text-muted-foreground">Outpoint</dt><dd className="font-mono">{live.lock.txid}:{live.lock.vout}</dd></div><div><dt className="text-muted-foreground">Witness script</dt><dd className="font-mono">{live.lock.witnessScript}</dd></div><div><dt className="text-muted-foreground">nLockTime ≥</dt><dd className="font-mono">{live.lock.locktime}</dd></div></dl></> : <><p className="mt-3 text-sm leading-6 text-muted-foreground">Demo only. A compatible wallet would verify and sign the claim transaction here.</p><Button className="mt-6 w-full"><Gift/> Simulate claim</Button></>}</div></main>;

  const statusLabel = live ? STATUS_LABEL[live.status] : isReady ? "Unlockable" : "Sealed";
  const txid = live?.lock?.txid;
  return <main className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
    <div className="grid items-center gap-12 lg:grid-cols-[.85fr_1.15fr]">
      <div className="relative mx-auto max-w-sm"><img src={bottleImage} alt="A sealed glass bottle with a message inside" width={1200} height={1504} className="max-h-[65vh] w-auto mix-blend-multiply"/><Badge className="absolute left-0 top-8"><LockKeyhole className="mr-1 size-3"/> {statusLabel}</Badge></div>
      <section><p className="text-xs font-bold uppercase text-primary">A bottle for {live ? live.recipientName : isReady ? "Mum" : "Ama"}</p><h1 className="mt-4 font-display text-5xl leading-tight sm:text-6xl">{live ? live.title : isReady ? "Mum’s birthday surprise" : "For Ama, when you turn 18"}</h1><p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{isReady ? "The wait is over. Your message and sats are ready." : preFunding ? "Your message is sealed. Your sats are being locked." : "Something meaningful is waiting. The message stays private until the opening date."}</p>
        {!isReady && <div className="mt-9 grid grid-cols-4 gap-px bg-border border border-border">{countdown.map(([n,l]) => <div key={l} className="bg-card p-4 text-center"><p className="font-display text-3xl">{n}</p><p className="mt-1 text-xs text-muted-foreground">{l}</p></div>)}</div>}
        <div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="border border-border p-5"><p className="text-xs text-muted-foreground">Gift amount</p><p className="mt-1 font-display text-3xl">{sats.toLocaleString()} sats</p><p className="mt-1 text-xs text-muted-foreground">Gift amount only</p></div><div className="border border-border p-5"><p className="text-xs text-muted-foreground">Opens</p><p className="mt-1 font-bold">{isReady ? "Ready now" : unlockAt.toLocaleDateString(undefined, { dateStyle: "long" })}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3 text-primary"/> Bitcoin {network}{live ? "" : " demo"}</p></div></div>
        <div className="mt-6 flex flex-wrap gap-3">{isReady ? <Button size="lg" onClick={open}><Sparkles/> Open bottle</Button> : <><Button size="lg" onClick={copy}>{copied ? <Check/> : <Clipboard/>}{copied ? "Copied" : "Copy link"}</Button><Button variant="outline" size="lg" onClick={() => setShowQr(!showQr)}><QrCode/> {showQr ? "Hide QR" : "Show QR"}</Button><Button variant="ghost" size="icon" aria-label="Share bottle" onClick={() => navigator.share?.({ title: live?.title ?? "A bottle for you", url: shareUrl ?? window.location.href }).catch(() => undefined)}><Share2/></Button></>}<Button asChild variant="ghost"><Link to="/dashboard">My bottles</Link></Button></div>
        {showQr && !isReady && <div className="mt-6 inline-block border border-border bg-white p-4"><QRCodeSVG value={shareUrl ?? (mounted ? window.location.href : "")} size={168}/></div>}
        {!recipient && live && !shareUrl && <p className="mt-4 text-xs text-muted-foreground">The share link with the message key was saved in the browser that created this bottle.</p>}
      </section>
    </div>
    {live && !recipient && <FundingPanel bottle={live} onChange={() => void query.refetch()}/>}
    <section className="mt-16 border-t border-border pt-8"><div className="grid gap-7 md:grid-cols-3">{([
      [Clock3, "Timelock reached", live ? (isReady ? "Yes — confirmed by block time" : "No — waiting for block time") : isReady ? "Yes — demo condition met" : "No — waiting for block time"],
      [ShieldCheck, "Confirmations", live ? (txid ? `${live.lock?.confirmations ?? 0} confirmations · verified on-chain` : "Waiting for the funding transaction") : "12 confirmations · verified"],
      [ExternalLink, "Transaction", live ? (txid ? <a className="underline" href={explorerTxUrl(live.network, txid)} target="_blank" rel="noreferrer">{network} · {txid.slice(0, 4)}…{txid.slice(-4)}</a> : `${network} · not yet funded`) : "Signet · 8fd2…91ac"],
    ] as Array<[LucideIcon, string, ReactNode]>).map(([Icon,t,d]) => <div key={t} className="flex gap-3"><Icon className="size-5 text-primary"/><div><p className="font-bold">{t}</p><p className="mt-1 text-sm text-muted-foreground">{d}</p></div></div>)}</div><p className="mt-8 text-xs leading-5 text-muted-foreground">{live ? "Status is read from public chain data (mempool.space). This app never holds keys or creates the spend; Bitcoin consensus rules enforce the timelock." : "Demo status only. This frontend does not verify the chain, hold keys, or create a spend. Bitcoin consensus rules—not this app—must enforce a production timelock."}</p></section>
  </main>;
}
