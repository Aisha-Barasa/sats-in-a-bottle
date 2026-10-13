import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./http.js";
import type { FundingProvider } from "./funding/provider.js";
import { accessRouter } from "./routes/access.js";
import { bottlesRouter } from "./routes/bottles.js";
import { mpesaRouter, webhookRouter } from "./routes/funding.js";
import { sessionRouter } from "./routes/session.js";

export type AppDeps = { fundingProvider: FundingProvider | null };

export function createApp(deps: AppDeps = { fundingProvider: null }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.CORS_ORIGIN.split(",") }));
  // Mounted before express.json(): signatures are checked against the raw body.
  app.use("/api/webhooks", webhookRouter(deps.fundingProvider));
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      network: config.BITCOIN_NETWORK,
      fundingProvider: deps.fundingProvider ? { name: deps.fundingProvider.name, env: config.BITIKA_ENV } : null,
    });
  });
  app.use("/api/session", sessionRouter);
  app.use("/api/bottles/:id/funding/mpesa", mpesaRouter(deps.fundingProvider));
  app.use("/api/bottles", bottlesRouter);
  app.use("/api/access", accessRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
