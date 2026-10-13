import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Menu, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { WalletProvider } from "@/components/wallet-provider";
import { ConnectWalletButton, ConnectWalletDialog } from "@/components/connect-wallet";
import { SiteFooter } from "@/components/site-footer";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sats in a Bottle" },
      { name: "description", content: "Money with a message, locked until it matters." },
      { name: "author", content: "Sats in a Bottle" },
      { property: "og:title", content: "Sats in a Bottle" },
      { property: "og:description", content: "Money with a message, locked until it matters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700&display=swap" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [open, setOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
              <Link to="/" className="group flex items-center gap-3" aria-label="Sats in a Bottle home">
                <span className="grid size-9 place-items-center rounded-full border border-primary bg-secondary font-display text-xl transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">₿</span>
                <span className="font-display text-xl">Sats in a Bottle</span>
              </Link>
              <nav className="hidden items-center gap-7 text-sm font-semibold md:flex" aria-label="Main navigation">
                <Link to="/dashboard" className="link-underline text-muted-foreground transition-colors hover:text-foreground" activeProps={{ className: "text-foreground" }}>My bottles</Link>
                <ConnectWalletButton />
                <Button asChild size="sm" className="press"><Link to="/create"><Plus /> Create bottle</Link></Button>
              </nav>
              <Button className="md:hidden" size="icon" variant="ghost" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</Button>
            </div>
            {open && <nav className="grid gap-2 border-t border-border p-4 md:hidden"><Button asChild variant="ghost"><Link to="/dashboard" onClick={() => setOpen(false)}>My bottles</Link></Button><ConnectWalletButton size="default" /><Button asChild><Link to="/create" onClick={() => setOpen(false)}>Create bottle</Link></Button></nav>}
          </header>
          <div className="flex-1">
            <Outlet />
          </div>
          <SiteFooter />
          <ConnectWalletDialog />
          <Toaster position="top-center" />
        </div>
      </WalletProvider>
    </QueryClientProvider>
  );
}
