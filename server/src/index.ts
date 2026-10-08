import { createApp } from "./app.js";
import { config } from "./config.js";
import { MempoolClient } from "./chain/mempool.js";
import { startWatcher } from "./chain/watcher.js";

createApp().listen(config.PORT, () => {
  console.log(`server listening on :${config.PORT} (${config.BITCOIN_NETWORK})`);
});
startWatcher(new MempoolClient());
