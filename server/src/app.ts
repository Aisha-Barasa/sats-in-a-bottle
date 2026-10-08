import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./http.js";
import { accessRouter } from "./routes/access.js";
import { bottlesRouter } from "./routes/bottles.js";
import { sessionRouter } from "./routes/session.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.CORS_ORIGIN.split(",") }));
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, network: config.BITCOIN_NETWORK });
  });
  app.use("/api/session", sessionRouter);
  app.use("/api/bottles", bottlesRouter);
  app.use("/api/access", accessRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
