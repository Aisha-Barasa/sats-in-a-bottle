import cors from "cors";
import express from "express";
import { config, serviceFeeBps } from "./config.js";
import { errorHandler } from "./http.js";
import type { ChainClient } from "./chain/mempool.js";
import type { FundingProvider } from "./funding/provider.js";
import { accessRouter } from "./routes/access.js";
import { MESSAGE_BODY_LIMIT, MIN_BOTTLE_SATS, bottlesRouter } from "./routes/bottles.js";
import { devRouter } from "./routes/dev.js";
import { mpesaRouter, quoteRouter, webhookRouter } from "./routes/funding.js";
import { sessionRouter } from "./routes/session.js";

export type AppDeps = {
  fundingProvider: FundingProvider | null;
  chain: ChainClient | null;
  /** Serverless only: brings bottles up to date with the chain before reads (see onDemandWatcher). */
  refreshChain?: () => Promise<void>;
};

export function createApp(deps: AppDeps = { fundingProvider: null, chain: null }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.CORS_ORIGIN.split(",") }));
  const { refreshChain } = deps;
  if (refreshChain) {
    app.use(["/api/bottles", "/api/access"], (req, _res, next) => {
      if (req.method !== "GET") return next();
      refreshChain().then(() => next(), next);
    });
  }
  // Mounted before express.json(): signatures are checked against the raw body.
  app.use("/api/webhooks", webhookRouter(deps.fundingProvider));
  // The encrypted message can carry a voice note and a photo, so it gets a bigger body limit.
  app.use("/api/bottles/:id/message", express.json({ limit: MESSAGE_BODY_LIMIT }));
  app.use(express.json({ limit: "256kb" }));

  // /api/health is what the web app calls through its /api proxy.
  app.get(["/health", "/api/health"], (_req, res) => {
    const p = deps.fundingProvider;
    res.json({
      ok: true,
      network: config.BITCOIN_NETWORK,
      fundingProvider: p ? { name: p.name, env: config.BITIKA_ENV } : null,
      devTools: config.DEV_TOOLS,
      serviceFeeBps,
      limits: { minSats: MIN_BOTTLE_SATS, minKes: p?.minKes ?? null, maxKes: p?.maxKes ?? null },
    });
  });
  app.use("/api/session", sessionRouter);
  app.use("/api/funding", quoteRouter(deps.fundingProvider));
  app.use("/api/bottles/:id/funding/mpesa", mpesaRouter(deps.fundingProvider));
  app.use("/api/bottles", bottlesRouter);
  app.use("/api/access", accessRouter(deps.chain));
  if (config.DEV_TOOLS) app.use("/api/dev", devRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
