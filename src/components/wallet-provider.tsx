import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { WALLETS, walletById, type WalletOption } from "@/lib/wallets";

type Status = "disconnected" | "connecting" | "connected";

type WalletState = {
  status: Status;
  wallet: WalletOption | null;
  balance: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  connect: (id: string) => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletState | null>(null);
const STORAGE_KEY = "siab.demo-wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("disconnected");
  const [walletId, setWalletId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Restore after hydration so server and client markup match.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved && WALLETS.some((w) => w.id === saved)) {
      setWalletId(saved);
      setStatus("connected");
    }
  }, []);

  const connect = useCallback(async (id: string) => {
    const wallet = walletById(id);
    if (!wallet) return;
    setStatus("connecting");
    setWalletId(id);
    // INTEGRATION POINT: replace this simulated handshake with the real
    // provider connection (see src/lib/wallets.ts for per-wallet notes).
    await new Promise((resolve) => setTimeout(resolve, 1100));
    setStatus("connected");
    window.localStorage.setItem(STORAGE_KEY, id);
    setOpen(false);
    toast.success(`${wallet.name} connected`, {
      description: "Demo connection on Bitcoin Signet — no real funds move.",
    });
  }, []);

  const disconnect = useCallback(() => {
    setStatus("disconnected");
    setWalletId(null);
    window.localStorage.removeItem(STORAGE_KEY);
    toast("Wallet disconnected");
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      status,
      wallet: walletById(walletId),
      balance: 412_500,
      open,
      setOpen,
      connect,
      disconnect,
    }),
    [status, walletId, open, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
