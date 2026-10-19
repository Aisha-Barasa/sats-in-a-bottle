import { bitikaBaseUrl, config } from "../config.js";
import { BitikaProvider } from "./bitika.js";
import type { FundingProvider } from "./provider.js";

export function createFundingProvider(): FundingProvider | null {
  if (config.FUNDING_PROVIDER !== "bitika") return null;
  return new BitikaProvider({
    baseUrl: bitikaBaseUrl,
    apiKey: config.BITIKA_API_KEY!,
    webhookSecret: config.BITIKA_WEBHOOK_SECRET,
  });
}
