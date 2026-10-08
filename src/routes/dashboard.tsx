import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, CirclePlus, Clock3, Gift, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getSessionToken, STATUS_LABEL, type Bottle } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "My Bottles — Sats in a Bottle" }, { name: "description", content: "See your sent, received, sealed, and ready Bitcoin gift bottles." },
    { property: "og:title", content: "My Bottles — Sats in a Bottle" }, { property: "og:description", content: "See your sent, received, sealed, and ready Bitcoin gift bottles." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}), component: Dashboard,
});

const demoBottles = [
  { id: "ama-2030", title: "For Ama, when you turn 18", person: "Ama", sats: "125,000", date: "18 Jun 2030", state: "Sealed", icon: LockKeyhole },
  { id: "mama-2026", title: "Mum’s birthday surprise", person: "Mum", sats: "48,000", date: "Ready now", state: "Unlockable", icon: Gift },
  { id: "kwame-draft", title: "Graduation day", person: "Kwame", sats: "—", date: "Not scheduled", state: "Draft", icon: Clock3 },
];

const STATUS_ICON = { draft: Clock3, awaiting_funding: Clock3, funded: LockKeyhole, sealed: LockKeyhole, unlockable: Gift, claimed: Gift };

function toCard(b: Bottle) {
  const ready = b.status === "unlockable" || b.status === "claimed";
  return {
    id: b.id,
    title: b.title,
    person: b.recipientName,
    sats: (b.lock?.amountSats ?? b.amountSats).toLocaleString(),
    date: ready ? "Ready now" : new Date(b.unlockAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    state: STATUS_LABEL[b.status],
    icon: STATUS_ICON[b.status],
  };
}

function Dashboard() {
  const [filter, setFilter] = useState("All");
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => setHasSession(Boolean(getSessionToken())), []);
  const { data } = useQuery({ queryKey: ["bottles"], queryFn: api.listBottles, enabled: hasSession, refetchInterval: 30_000 });
  // Show real bottles once there are any; otherwise keep the sample cards.
  const bottles = data && data.length > 0 ? data.map(toCard) : demoBottles;
  const filtered = filter === "All" ? bottles : bottles.filter((b) => b.state === filter);
  return <main className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
    <div className="flex flex-col justify-between gap-6 border-b border-border pb-9 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase text-primary">Your time capsules</p><h1 className="mt-3 font-display text-5xl">My bottles</h1><p className="mt-2 text-muted-foreground">Every message, every sat, and where it stands.</p></div><Button asChild><Link to="/create"><CirclePlus /> New bottle</Link></Button></div>
    <div className="my-8 flex gap-2 overflow-x-auto pb-2">{["All","Sealed","Unlockable","Draft"].map((item) => <Button key={item} variant={filter === item ? "default" : "outline"} size="sm" onClick={() => setFilter(item)}>{item}</Button>)}</div>
    <div className="grid gap-4 lg:grid-cols-3">{filtered.map(({id,title,person,sats,date,state,icon: Icon}, index) => <Link key={id} to="/bottle/$id" params={{id}} style={{ animationDelay: `${index * 90}ms` }} className="lift rise group border border-border bg-card p-6"><div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-full bg-secondary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"><Icon className="size-5 text-primary" /></span><Badge variant={state === "Unlockable" ? "default" : "outline"}>{state}</Badge></div><h2 className="mt-10 font-display text-2xl leading-tight">{title}</h2><p className="mt-2 text-sm text-muted-foreground">For {person}</p><div className="mt-8 flex items-end justify-between border-t border-border pt-5"><div><p className="text-xs text-muted-foreground">Value</p><p className="font-bold">{sats} sats</p></div><div className="text-right"><p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3"/>{date}</p><ArrowUpRight className="ml-auto mt-2 size-5 transition group-hover:text-primary"/></div></div></Link>)}</div>
  </main>;
}