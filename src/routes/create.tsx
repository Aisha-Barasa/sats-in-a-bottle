import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleCheck, Heart, Image, LockKeyhole, Mic, ShieldCheck, Type, WalletCards, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api, ensureSession, saveLocalBottle } from "@/lib/api";
import { encryptMessage } from "@/lib/message-crypto";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [
    { title: "Create a Bottle — Sats in a Bottle" }, { name: "description", content: "Create a personal message, add sats, and choose its future opening date." },
    { property: "og:title", content: "Create a Bottle — Sats in a Bottle" }, { property: "og:description", content: "Create a personal message, add sats, and choose its future opening date." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}), component: CreateBottle,
});

const steps = ["Recipient", "Message", "Sats", "Unlock", "Review"];

function CreateBottle() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [recipient, setRecipient] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("text");
  const [sats, setSats] = useState("100000");
  const [date, setDate] = useState("2030-06-18");
  const [wallet, setWallet] = useState(false);
  const [recipientPubkey, setRecipientPubkey] = useState("");
  const [sealing, setSealing] = useState(false);
  const pubkeyValid = !recipientPubkey.trim() || /^0[23][0-9a-fA-F]{64}$/.test(recipientPubkey.trim());
  const btc = useMemo(() => ((Number(sats) || 0) / 100_000_000).toFixed(8), [sats]);
  const canContinue = (step !== 0 || (recipient.trim() && title.trim() && pubkeyValid)) && !sealing;

  // Creates the bottle, attaches the client-side encrypted message, issues the
  // recipient link and (if a recipient key was given) prepares the CLTV address.
  const seal = async () => {
    setSealing(true);
    try {
      await ensureSession();
      const pubkey = recipientPubkey.trim().toLowerCase();
      const bottle = await api.createBottle({
        title: title.trim(),
        recipientName: recipient.trim(),
        amountSats: Number(sats),
        unlockAt: new Date(`${date}T12:00:00`).toISOString(),
        ...(pubkey ? { recipientPubkey: pubkey } : {}),
      });
      const encrypted = await encryptMessage(messageType === "text" ? message : "");
      await api.attachMessage(bottle.id, {
        type: messageType as "text" | "voice" | "photo",
        objectRef: "inline",
        ciphertext: encrypted.ciphertext,
        encryptionMeta: { alg: "AES-GCM", iv: encrypted.iv },
      });
      const access = await api.issueAccess(bottle.id);
      saveLocalBottle(bottle.id, { key: encrypted.key, shareUrl: `${access.url}#k=${encrypted.key}` });
      if (pubkey) await api.prepareFunding(bottle.id);
      navigate({ to: "/bottle/$id", params: { id: bottle.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not seal the bottle");
      setSealing(false);
    }
  };
  const next = () => step < 4 ? setStep(step + 1) : void seal();

  return <main className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
    <div className="mb-10 flex items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase text-primary">Create a bottle</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Leave something for the future.</h1></div><span className="hidden text-sm text-muted-foreground sm:block">Draft saved locally</span></div>
    <ol className="mb-10 grid grid-cols-5 border-y border-border py-4">{steps.map((label, index) => <li key={label} className={`flex items-center gap-2 text-xs font-bold ${index <= step ? "text-foreground" : "text-muted-foreground"}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full border ${index < step ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{index < step ? <Check className="size-3"/> : index + 1}</span><span className="hidden sm:inline">{label}</span></li>)}</ol>
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <section className="min-h-[450px] border border-border bg-card p-6 sm:p-10">
        {step === 0 && <div className="max-w-xl"><Heart className="mb-5 size-7 text-primary"/><h2 className="font-display text-3xl">Who is this moment for?</h2><p className="mt-2 text-muted-foreground">Use a name they’ll recognise when the bottle arrives.</p><label className="mt-8 block text-sm font-bold">Recipient name<Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. Ama" className="mt-2 h-12" autoFocus /></label><label className="mt-5 block text-sm font-bold">Bottle title<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. For when you turn 18" className="mt-2 h-12" /></label><label className="mt-5 block text-sm font-bold">Recipient Bitcoin public key <span className="font-normal text-muted-foreground">(optional)</span><Input value={recipientPubkey} onChange={(e) => setRecipientPubkey(e.target.value)} placeholder="02… or 03… (66 characters)" className="mt-2 h-12 font-mono text-sm" spellCheck={false} aria-invalid={!pubkeyValid} /></label><p className={`mt-2 text-xs ${pubkeyValid ? "text-muted-foreground" : "text-destructive"}`}>{pubkeyValid ? "Only their key can ever spend these sats. You can add it later, but it’s needed before funding." : "That doesn’t look like a compressed public key (66 hex characters starting 02 or 03)."}</p></div>}
        {step === 1 && <div className="max-w-2xl"><h2 className="font-display text-3xl">What should they find inside?</h2><p className="mt-2 text-muted-foreground">The sealed preview never shows this message before the opening date.</p><div className="mt-7 flex gap-2">{([["text",Type,"Write"],["voice",Mic,"Record"],["photo",Image,"Photo"]] as Array<[string, LucideIcon, string]>).map(([type,Icon,label]) => <Button key={type} variant={messageType === type ? "default" : "outline"} onClick={() => setMessageType(type)}><Icon />{label}</Button>)}</div>{messageType === "text" ? <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write the words you want them to carry..." className="mt-5 min-h-52 resize-none p-5 text-base leading-7"/> : <div className="mt-5 grid min-h-52 place-items-center border border-dashed border-border bg-muted/40 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-secondary"><Mic className="size-6 text-primary"/></span><p className="mt-4 font-bold">{messageType === "voice" ? "Tap to record your voice" : "Choose a meaningful photo"}</p><p className="mt-1 text-sm text-muted-foreground">Demo input—no file will be uploaded.</p></div></div>}</div>}
        {step === 2 && <div className="max-w-xl"><h2 className="font-display text-3xl">How many sats would you like to seal?</h2><p className="mt-2 text-muted-foreground">The gift amount and estimated network fee are always shown separately.</p><label className="mt-8 block text-sm font-bold">Gift amount<div className="relative mt-2"><Input type="number" min="1000" value={sats} onChange={(e) => setSats(e.target.value)} className="h-20 pr-20 font-display text-3xl"/><span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-primary">sats</span></div></label><div className="mt-4 flex justify-between border-b border-border py-4 text-sm"><span className="text-muted-foreground">Bitcoin equivalent</span><strong>{btc} BTC</strong></div><div className="flex justify-between border-b border-border py-4 text-sm"><span className="text-muted-foreground">Estimated network fee</span><strong>1,240 sats</strong></div><Button className="mt-6" variant={wallet ? "secondary" : "outline"} onClick={() => setWallet(!wallet)}>{wallet ? <CircleCheck/> : <WalletCards/>}{wallet ? "Demo wallet connected" : "Connect demo wallet"}</Button></div>}
        {step === 3 && <div className="max-w-xl"><CalendarDays className="mb-5 size-7 text-primary"/><h2 className="font-display text-3xl">Choose when the bottle can open.</h2><p className="mt-2 leading-7 text-muted-foreground">Bitcoin’s rules will prevent the supported spend before this time. Reaching the date does not automatically move the sats.</p><label className="mt-8 block text-sm font-bold">Opening date<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 h-14" min="2026-09-20" /></label><div className="mt-6 flex gap-3 bg-secondary p-4 text-sm leading-6"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary"/><p><strong>Signet demo.</strong> No real Bitcoin will move. A production recovery path must be designed and tested before mainnet use.</p></div></div>}
        {step === 4 && <div><h2 className="font-display text-3xl">Ready to seal this moment?</h2><p className="mt-2 text-muted-foreground">Review every detail before sealing.</p><dl className="mt-8 divide-y divide-border border-y border-border">{[["For",recipient || "Ama"],["Bottle",title || "For when you turn 18"],["Message",messageType === "text" ? `${message.length || 0} characters` : messageType],["Gift",`${Number(sats).toLocaleString()} sats`],["Network fee","1,240 sats (estimate)"],["Opens",new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{dateStyle:"long"})],["Network","Bitcoin Signet · demo"]].map(([a,b]) => <div key={a} className="grid grid-cols-[120px_1fr] gap-4 py-4"><dt className="text-sm text-muted-foreground">{a}</dt><dd className="font-semibold">{b}</dd></div>)}</dl><div className="mt-6 flex gap-3 text-sm text-muted-foreground"><LockKeyhole className="size-5 shrink-0 text-primary"/><p>Sealing creates this bottle’s Bitcoin timelock address. This app never holds keys: you fund the address from your own wallet, and only the recipient’s key can spend it after the opening date.</p></div></div>}
        <div className="mt-10 flex justify-between border-t border-border pt-6"><Button variant="ghost" onClick={() => step ? setStep(step - 1) : navigate({to:"/"})}><ArrowLeft/> Back</Button><Button onClick={next} disabled={!canContinue}>{step === 4 ? (sealing ? "Sealing…" : "Seal bottle") : "Continue"}<ArrowRight/></Button></div>
      </section>
      <aside className="hidden border-l border-border pl-8 lg:block"><p className="text-xs font-bold uppercase text-muted-foreground">Bottle preview</p><div className="mx-auto mt-10 h-64 w-36 rounded-t-[3rem] rounded-b-[4rem] border-2 border-primary/40 bg-secondary/40 p-5 pt-20 text-center bottle-glow"><LockKeyhole className="mx-auto size-7 text-primary"/><p className="mt-5 font-display text-xl leading-tight">{title || "A future moment"}</p><p className="mt-2 text-xs text-muted-foreground">for {recipient || "someone special"}</p></div><p className="mt-8 text-center text-sm font-bold">{Number(sats).toLocaleString()} sats</p><p className="mt-1 text-center text-xs text-muted-foreground">Bitcoin Signet demo</p></aside>
    </div>
  </main>;
}