import { mempoolApiUrl } from "../config.js";

export type AddressTx = {
  txid: string;
  status: { confirmed: boolean; block_height?: number };
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
};

/** The subset of chain data the watcher needs; mocked in tests. */
export interface ChainClient {
  getAddressTxs(address: string): Promise<AddressTx[]>;
  getTipHeight(): Promise<number>;
  getMedianTimePast(): Promise<number>;
  isOutputSpent(txid: string, vout: number): Promise<boolean>;
}

export class MempoolClient implements ChainClient {
  constructor(private readonly baseUrl: string = mempoolApiUrl) {}

  private async get(path: string): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`mempool.space ${path} -> HTTP ${res.status}`);
    return res;
  }

  async getAddressTxs(address: string): Promise<AddressTx[]> {
    return (await (await this.get(`/address/${address}/txs`)).json()) as AddressTx[];
  }

  async getTipHeight(): Promise<number> {
    return Number(await (await this.get("/blocks/tip/height")).text());
  }

  async getMedianTimePast(): Promise<number> {
    const hash = (await (await this.get("/blocks/tip/hash")).text()).trim();
    const block = (await (await this.get(`/block/${hash}`)).json()) as { mediantime: number };
    return block.mediantime;
  }

  async isOutputSpent(txid: string, vout: number): Promise<boolean> {
    const body = (await (await this.get(`/tx/${txid}/outspend/${vout}`)).json()) as { spent: boolean };
    return body.spent;
  }
}
