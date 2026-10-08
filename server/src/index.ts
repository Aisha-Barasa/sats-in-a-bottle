import { createApp } from "./app.js";
import { config } from "./config.js";
import { MempoolClient } from "./chain/mempool.js";
import { startWatcher } from "./chain/watcher.js";
import { createFundingProvider } from "./funding/index.js";

const fundingProvider = createFundingProvider();

createApp({ fundingProvider }).listen(config.PORT, () => {
  const funding = fundingProvider ? `${fundingProvider.name} (${config.BITIKA_ENV})` : "disabled";
  console.log(`server listening on :${config.PORT} (${config.BITCOIN_NETWORK}, funding: ${funding})`);
  if (fundingProvider && !config.BITIKA_WEBHOOK_SECRET) {
    console.warn("BITIKA_WEBHOOK_SECRET not set: webhooks will be rejected; status falls back to polling.");
  }
});
startWatcher(new MempoolClient());
