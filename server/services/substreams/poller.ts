/**
 * Subgraph-backed market poller (no @substreams/* — safe for Next.js API routes).
 */

import { publishMarketEvent } from "@/server/services/market/bus"
import { getTopPools } from "@/server/services/subgraph/client"

export type StreamHandle = {
  stop: () => void
}

/**
 * Poll Uniswap subgraph top pools and emit MarketEvents.
 */
export async function pollSubgraphMarketOnce(chainId = 1): Promise<number> {
  const result = await getTopPools({ version: "v3", chainId, first: 5 })
  const pools =
    (result.data as { pools?: Array<Record<string, unknown>> })?.pools ??
    (result as { pools?: Array<Record<string, unknown>> }).pools
  if (!Array.isArray(pools)) return 0

  let n = 0
  for (const pool of pools) {
    const token0 = pool.token0 as { id?: string; symbol?: string } | undefined
    const token1 = pool.token1 as { id?: string; symbol?: string } | undefined
    await publishMarketEvent({
      chainId,
      pool: typeof pool.id === "string" ? pool.id : undefined,
      token0: token0?.id,
      token1: token1?.id,
      symbol0: token0?.symbol,
      symbol1: token1?.symbol,
      price: pool.token0Price != null ? String(pool.token0Price) : undefined,
      amount0: pool.totalValueLockedUSD
        ? String(pool.totalValueLockedUSD)
        : undefined,
    })
    n++
  }
  return n
}

/**
 * Background poller — live terminal feed without Substreams gRPC in the Next bundle.
 */
export function startMarketPoller(opts: {
  chainId?: number
  intervalMs?: number
}): StreamHandle {
  const chainId = opts.chainId ?? 1
  const intervalMs = opts.intervalMs ?? 8_000
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const tick = async () => {
    if (stopped) return
    try {
      await pollSubgraphMarketOnce(chainId)
    } catch (error) {
      console.warn("[market-poller]", error)
    }
    if (!stopped) timer = setTimeout(tick, intervalMs)
  }

  void tick()

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}
