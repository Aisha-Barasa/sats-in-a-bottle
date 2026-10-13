import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, CircleCheck, Heart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import bottleImage from "@/assets/gold-message-bottle.jpg";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Sats in a Bottle — A message to the future" },
    { name: "description", content: "Seal a personal message with Bitcoin and choose when it can be opened." },
    { property: "og:title", content: "Sats in a Bottle — A message to the future" },
    { property: "og:description", content: "Seal a personal message with Bitcoin and choose when it can be opened." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <main>
      <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden border-b border-border">
        <div className="paper-grid absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 md:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <div className="rise mb-8 inline-flex items-center gap-2 border-b border-primary pb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"><Heart className="heart-beat size-4 fill-primary text-primary" /> For the moments that matter</div>
            <h1 className="rise font-display text-6xl leading-[.95] sm:text-7xl lg:text-8xl" style={{ animationDelay: "80ms" }}>A message to the future, <span className="text-primary">sealed in sats.</span></h1>
            <p className="rise mt-7 max-w-xl text-lg leading-8 text-muted-foreground" style={{ animationDelay: "160ms" }}>Turn a birthday wish, a family promise, or a quiet hope into something they can hold onto—and open when the time is right.</p>
            <div className="rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}><Button asChild size="lg" className="press"><Link to="/create">Create a bottle <ArrowRight /></Link></Button><Button asChild variant="outline" size="lg" className="press"><Link to="/bottle/$id" params={{ id: "ama-2030" }}>Open demo bottle</Link></Button></div>
            <div className="rise mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-muted-foreground" style={{ animationDelay: "320ms" }}><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Self-custody by design</span><span className="flex items-center gap-2"><CircleCheck className="size-4 text-primary" /> Test network demo</span></div>
          </div>
          <div className="group relative mx-auto w-full max-w-md">
            <div className="warm-glow glow-pulse absolute inset-0 -z-10 blur-2xl" aria-hidden="true" />
            <div className="bottle-glow absolute inset-x-16 bottom-12 h-24 rounded-full bg-primary/25 blur-2xl" />
            <img src={bottleImage} alt="A glass bottle holding a rolled message" width={1200} height={1504} className="bottle-float relative mx-auto max-h-[68vh] w-auto mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.03]" />
            <div className="lift absolute bottom-4 left-0 border border-border bg-card p-4 shadow-lg"><p className="text-xs font-bold uppercase text-muted-foreground">Sealed value</p><p className="mt-1 font-display text-2xl">125,000 sats</p></div>
            <div className="lift absolute right-0 top-8 border border-border bg-card p-4 shadow-lg"><CalendarClock className="mb-2 size-5 text-primary"/><p className="text-xs text-muted-foreground">Opens on</p><p className="font-bold">18 June 2030</p></div>
          </div>
        </div>
      </section>
      <section className="bg-accent py-16 text-accent-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-3 lg:px-8">
          {[['01','Leave something real','Write the words they should hear later, or record them in your own voice.'],['02','Add a little tomorrow','Choose an amount in sats. Gift value and network fee stay separate and clear.'],['03','Choose the moment','Set the date. The Bitcoin condition—not a promise from us—controls when it can move.']].map(([n,t,d]) => <article key={n} className="group border-t border-accent-foreground/25 pt-5 transition-all duration-300 hover:border-primary"><span className="inline-block font-display text-3xl text-primary transition-transform duration-300 group-hover:-translate-y-1">{n}</span><h2 className="mt-8 font-display text-3xl">{t}</h2><p className="mt-3 leading-7 text-accent-foreground/65">{d}</p></article>)}
        </div>
      </section>
    </main>
  );
}
