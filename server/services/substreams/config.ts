/**
 * Substreams config + Uniswap-oriented package pin.
 * Package: StreamingFast ethereum-common (events) — swap filtering in mapper.
 * Override with SUBSTREAMS_SPKG / SUBSTREAMS_MODULE.
 */

export const SUBSTREAMS_DEFAULTS = {
  endpoint: "mainnet.eth.streamingfast.io:443",
  /** Public Uniswap V3 Ethereum package on spkg registry when available; fallback module below. */
  spkg:
    process.env.SUBSTREAMS_SPKG ||
    "https://spkg.io/streamingfast/ethereum-common-v0.3.3.spkg",
  module: process.env.SUBSTREAMS_MODULE || "all_events",
  chainId: Number(process.env.SUBSTREAMS_CHAIN_ID || 1),
} as const

export function getSubstreamsToken(): string | null {
  return process.env.SUBSTREAMS_API_TOKEN?.trim() || null
}

export function getSubstreamsEndpoint(): string {
  const raw =
    process.env.SUBSTREAMS_ENDPOINT?.trim() || SUBSTREAMS_DEFAULTS.endpoint
  // Accept host:port or https://host
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

export function isSubstreamsConfigured(): boolean {
  return Boolean(getSubstreamsToken())
}
