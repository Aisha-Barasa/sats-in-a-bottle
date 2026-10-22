// Entry point on Vercel (see /api/index.js): the same app as index.ts, but a serverless function
// can't keep a timer running, so the chain is checked when someone looks at a bottle instead.
import { createApp } from "./app.js";
import { MempoolClient } from "./chain/mempool.js";
import { onDemandWatcher } from "./chain/watcher.js";
import { createFundingProvider } from "./funding/index.js";

const chain = new MempoolClient();

export default createApp({ fundingProvider: createFundingProvider(), chain, refreshChain: onDemandWatcher(chain) });
