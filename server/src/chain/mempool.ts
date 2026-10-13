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
  /** sat/vB the network currently wants for confirmation within ~30 minutes. */
  getFeeRate(): Promise<number>;
  /** Relays a signed transaction; returns its txid or throws BroadcastError. */
  broadcast(hex: string): Promise<string>;
}

export class BroadcastError extends Error {}

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

  async getFeeRate(): Promise<number> {
    const fees = (await (await this.get("/v1/fees/recommended")).json()) as { halfHourFee: number };
    return fees.halfHourFee;
  }

  async broadcast(hex: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/tx`, { method: "POST", body: hex, signal: AbortSignal.timeout(15_000) });
    const text = (await res.text()).trim();
    // mempool.space returns the node's rejection reason as plain text.
    if (!res.ok) throw new BroadcastError(text.slice(0, 300) || `HTTP ${res.status}`);
    return text;
  }
}
