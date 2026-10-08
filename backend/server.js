require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bottlesRouter = require("./routes/bottles");
const scheduler = require("./services/scheduler");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/bottles", bottlesRouter);
// Daraja callback is mounted under /api/bottles too (see routes/bottles.js),
// reachable at /api/bottles/mpesa/callback

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Sats in a Bottle API running on http://localhost:${PORT}`);
  scheduler.start();
});
