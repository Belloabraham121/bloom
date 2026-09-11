/**
 * Live Uniswap subgraph registry (The Graph Network).
 * Agents query these on demand — nothing is synced into Bloom Postgres.
 *
 * Mainnet V2/V3/V4 IDs from Uniswap docs; other chains from active public
 * Graph Explorer deployments (verified queryable with pools/pairs + tokens).
 * Override any entry with env UNISWAP_SUBGRAPH_{V2|V3|V4}_{CHAIN}
 * e.g. UNISWAP_SUBGRAPH_V3_8453=
 */

export type UniswapVersion = "v2" | "v3" | "v4"

export type SubgraphMarket = {
  version: UniswapVersion
  chainId: number
  chainName: string
  subgraphId: string
}

const CHAIN_NAMES: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  130: "unichain",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  43114: "avalanche",
}

/**
 * Built-in defaults (subgraph id, not IPFS hash).
 * Prefer Uniswap-documented mainnet IDs; L2/L3 from high-signal public deployments.
 */
const DEFAULTS: Record<UniswapVersion, Partial<Record<number, string>>> = {
  v2: {
    1: "A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum",
    8453: "DbcUmZwXBYbNZvLuDEvcmFa4uAWwwjrdX8dVFg1AUVKa",
  },
  v3: {
    1: "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
    10: "Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82zwiBFLaj",
    56: "7XgdLW3bts4HktCYsu9dy8bEnuiNeZuftcuK3Aj4JXYV",
    137: "EsLGwxyeMMeJuhqWvuLmJEiDKXJ4Z6YsoJreUnyeozco",
    8453: "GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz",
    42161: "FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM",
  },
  v4: {
    1: "DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G",
    10: "3Tn7Y1NJAr4ySKm7KFu1dwvH2WM3mHJnXzXAxQsdBDvW",
    56: "EAq1nJKgjnuKH6Gj4RFjCW7LcL7E2uipbncdwV7TTWkX",
    130: "Bd8UnJU8jCRJKVjcW16GHM3FNdfwTojmWb3QwSAmv8Uc",
    137: "2CB2uQxcDKWDenagn2z17KQVCtfwSx5eXYuvqTciRTJu",
    8453: "Gqm2b5J85n1bhCyDMpGbtbVn4935EvvdyHdHrx3dibyj",
    42161: "D1VHPU6cXXSC8eaApWCjCnPcTZQFSYCpGoDAvt4ogDWh",
    43114: "49JxRo9FGxWpSf5Y5GKQPj5NUpX2HhpoZHpGzNEWQZjq",
  },
}

function envOverride(version: UniswapVersion, chainId: number): string | undefined {
  const key = `UNISWAP_SUBGRAPH_${version.toUpperCase()}_${chainId}`
  const v = process.env[key]
  return v && v.trim() ? v.trim() : undefined
}

export function resolveSubgraphId(
  version: UniswapVersion,
  chainId: number
): string | null {
  const fromEnv = envOverride(version, chainId)
  if (fromEnv) return fromEnv

  // Legacy single-ID env for V3 Ethereum
  if (version === "v3" && chainId === 1) {
    const legacy = process.env.THE_GRAPH_UNISWAP_SUBGRAPH_ID?.trim()
    if (legacy) return legacy
  }

  return DEFAULTS[version][chainId] || null
}

export function listSubgraphMarkets(): SubgraphMarket[] {
  const markets: SubgraphMarket[] = []
  for (const version of ["v2", "v3", "v4"] as UniswapVersion[]) {
    const chains = new Set<number>([
      ...Object.keys(DEFAULTS[version]).map(Number),
      // include any env-overridden chains
      ...Object.keys(process.env)
        .filter((k) => k.startsWith(`UNISWAP_SUBGRAPH_${version.toUpperCase()}_`))
        .map((k) => Number(k.split("_").pop()))
        .filter((n) => Number.isFinite(n)),
    ])
    for (const chainId of chains) {
      const subgraphId = resolveSubgraphId(version, chainId)
      if (!subgraphId) continue
      markets.push({
        version,
        chainId,
        chainName: CHAIN_NAMES[chainId] || `chain-${chainId}`,
        subgraphId,
      })
    }
  }
  return markets.sort((a, b) => a.chainId - b.chainId || a.version.localeCompare(b.version))
}

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] || `chain-${chainId}`
}
