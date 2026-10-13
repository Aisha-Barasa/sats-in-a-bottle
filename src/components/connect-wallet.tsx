import { CircleCheck, Loader2, Unplug, WalletCards, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WALLETS } from "@/lib/wallets";
import { useWallet } from "@/components/wallet-provider";

export function ConnectWalletButton({
  size = "sm",
  className,
}: {
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const { status, wallet, setOpen, disconnect } = useWallet();

  if (status === "connected" && wallet) {
    return (
      <Button
        size={size}
        variant="secondary"
        className={className}
        onClick={disconnect}
        title="Disconnect demo wallet"
      >
        <CircleCheck className="text-primary" /> {wallet.name}
        <Unplug className="opacity-60" />
      </Button>
    );
  }

  return (
    <Button size={size} variant="outline" className={className} onClick={() => setOpen(true)}>
      <WalletCards /> Connect wallet
    </Button>
  );
}

export function ConnectWalletDialog() {
  const { open, setOpen, connect, status, wallet } = useWallet();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">Connect a wallet</DialogTitle>
          <DialogDescription>
            Choose where the sats for your bottle will come from. Every option below is a
            demo handshake on Bitcoin Signet — no real balance is touched.
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-2 grid gap-2">
          {WALLETS.map((option) => {
            const busy = status === "connecting" && wallet?.id === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={status === "connecting"}
                  onClick={() => connect(option.id)}
                  className="group flex w-full items-center gap-4 rounded-md border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-display text-lg text-primary transition-transform group-hover:scale-110">
                    {busy ? <Loader2 className="size-5 animate-spin" /> : option.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">
                      {option.name}
                      {option.kind === "lightning" && <Zap className="size-3.5 text-primary" />}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {option.tagline}
                    </span>
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                    {option.live ? "Live" : "Demo"}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Integration slot: real Blink, Bitnob and Lightning connections plug in here later.
          Sats in a Bottle never holds your keys.
        </p>
      </DialogContent>
    </Dialog>
  );
}
