import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-accent text-accent-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full border border-primary font-display text-xl text-primary">
              ₿
            </span>
            <span className="font-display text-xl">Sats in a Bottle</span>
          </span>
          <p className="mt-4 max-w-sm text-sm leading-7 text-accent-foreground/70">
            Money with a message, locked until it matters. Bitcoin consensus decides when a
            bottle can open — never us.
          </p>
        </div>
        <nav className="text-sm" aria-label="Footer navigation">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Explore</p>
          <ul className="mt-4 grid gap-3 text-accent-foreground/70">
            <li><Link to="/" className="transition-colors hover:text-primary">Home</Link></li>
            <li><Link to="/create" className="transition-colors hover:text-primary">Create a bottle</Link></li>
            <li><Link to="/dashboard" className="transition-colors hover:text-primary">My bottles</Link></li>
          </ul>
        </nav>
        <div className="text-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Status</p>
          <ul className="mt-4 grid gap-3 text-accent-foreground/70">
            <li>Bitcoin Signet · demo</li>
            <li>Wallet connections simulated</li>
            <li>Self-custody by design</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-accent-foreground/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-accent-foreground/60 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© 2026 Sats in a Bottle. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            Made with <Heart className="size-3.5 fill-primary text-primary" /> for the moments that matter
          </p>
        </div>
      </div>
    </footer>
  );
}
