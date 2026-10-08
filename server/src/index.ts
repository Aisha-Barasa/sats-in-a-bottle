import express from "express";
import cors from "cors";
import { config } from "./config.js";

const app = express();
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: config.BITCOIN_NETWORK });
});

app.listen(config.PORT, () => {
  console.log(`server listening on :${config.PORT} (${config.BITCOIN_NETWORK})`);
});
