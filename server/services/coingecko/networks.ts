/** CoinGecko / GeckoTerminal network ids used by onchain logo endpoints. */

export type CoinGeckoNetwork = {
  /** GeckoTerminal onchain network id (e.g. eth, base) */
  onchain: string
  /** CoinGecko asset_platform id for /coins/{id}/contract/... */
  platform: string
}

const BY_CHAIN_ID: Record<number, CoinGeckoNetwork> = {
  1: { onchain: "eth", platform: "ethereum" },
  10: { onchain: "optimism", platform: "optimistic-ethereum" },
  56: { onchain: "bsc", platform: "binance-smart-chain" },
  130: { onchain: "unichain", platform: "unichain" },
  137: { onchain: "polygon_pos", platform: "polygon-pos" },
  8453: { onchain: "base", platform: "base" },
  42161: { onchain: "arbitrum", platform: "arbitrum-one" },
  43114: { onchain: "avax", platform: "avalanche" },
}

export function getCoinGeckoNetwork(chainId: number): CoinGeckoNetwork | null {
  return BY_CHAIN_ID[chainId] ?? null
}
