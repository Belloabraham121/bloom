/**
 * Market tick poller: CoinGecko for watched-pair price (reliable), Graph for pool context.
 */

import { publishMarketEvent } from "@/server/services/market/bus"
import { getTopPools } from "@/server/services/subgraph/client"
import { pollCoinGeckoPriceOnce } from "@/server/services/market/price-fallback"

export type StreamHandle = {
  stop: () => void
}

export type PollMarketOpts = {
  chainId?: number
  symbol0?: string
  symbol1?: string
  userId?: string | null
}

function isNetworkDnsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  const cause =
    error instanceof Error ? (error as Error & { cause?: unknown }).cause : null
  const causeMsg = cause instanceof Error ? cause.message : String(cause || "")
  const blob = `${msg} ${causeMsg}`
  return (
    blob.includes("ENOTFOUND") ||
    blob.includes("EAI_AGAIN") ||
    blob.includes("getaddrinfo") ||
    blob.includes("fetch failed") ||
    blob.includes("CONNECT tunnel")
  )
}

function preferWatchedPool(
  pools: Array<Record<string, unknown>>,
  symbol0?: string,
  symbol1?: string
) {
  if (!symbol0 && !symbol1) return pools
  const a = (symbol0 || "").toUpperCase()
  const b = (symbol1 || "").toUpperCase()
  const aliases = (s: string) =>
    new Set(
      [s, s === "ETH" ? "WETH" : "", s === "WETH" ? "ETH" : ""].filter(Boolean)
    )
  const want0 = aliases(a)
  const want1 = aliases(b)
  const matched = pools.filter((p) => {
    const t0 = String((p.token0 as { symbol?: string } | undefined)?.symbol || "").toUpperCase()
    const t1 = String((p.token1 as { symbol?: string } | undefined)?.symbol || "").toUpperCase()
    return (
      (want0.has(t0) && want1.has(t1)) || (want0.has(t1) && want1.has(t0))
    )
  })
  return matched.length ? matched : pools
}

/**
 * Poll Uniswap subgraph top pools and emit MarketEvents (with real prices when available).
 */
export async function pollSubgraphMarketOnce(
  chainId = 1,
  opts?: { symbol0?: string; symbol1?: string }
): Promise<number> {
  const result = await getTopPools({ version: "v3", chainId, first: 15 })
  const raw =
    (result.data as { pools?: Array<Record<string, unknown>> })?.pools ??
    (result as { pools?: Array<Record<string, unknown>> }).pools
  if (!Array.isArray(raw) || !raw.length) return 0

  const pools = preferWatchedPool(raw, opts?.symbol0, opts?.symbol1).slice(0, 5)

  let n = 0
  for (const pool of pools) {
    const token0 = pool.token0 as { id?: string; symbol?: string } | undefined
    const token1 = pool.token1 as { id?: string; symbol?: string } | undefined
    const token0Price =
      pool.token0Price != null ? String(pool.token0Price) : undefined
    const token1Price =
      pool.token1Price != null ? String(pool.token1Price) : undefined
    // Prefer price of ETH/WETH in USDC terms when possible
    const s0 = (token0?.symbol || "").toUpperCase()
    const s1 = (token1?.symbol || "").toUpperCase()
    const ethLike = (s: string) => s === "ETH" || s === "WETH"
    let price = token1Price || token0Price
    if (ethLike(s0) && token1Price) price = token1Price
    if (ethLike(s1) && token0Price) price = token0Price

    await publishMarketEvent({
      chainId,
      pool: typeof pool.id === "string" ? pool.id : undefined,
      token0: token0?.id,
      token1: token1?.id,
      symbol0: token0?.symbol,
      symbol1: token1?.symbol,
      price,
      amount0: pool.tvlUsd != null ? String(pool.tvlUsd) : undefined,
      amount1: undefined,
    })
    n++
  }
  return n
}

/**
 * Always refresh CoinGecko spot first (fills LiveMarketTick + chart).
 * Graph enrichment is best-effort and must not block price updates.
 */
export async function pollMarketOnce(opts: PollMarketOpts = {}): Promise<{
  count: number
  source: "graph+coingecko" | "coingecko" | "graph"
}> {
  const chainId = opts.chainId ?? 1

  // CoinGecko first so UI always gets a numeric price quickly
  let cg = 0
  try {
    cg = await pollCoinGeckoPriceOnce({
      chainId,
      symbol0: opts.symbol0,
      symbol1: opts.symbol1,
      userId: opts.userId,
    })
  } catch (error) {
    console.warn("[market-poller] coingecko", error)
  }

  let graphCount = 0
  try {
    graphCount = await Promise.race([
      pollSubgraphMarketOnce(chainId, {
        symbol0: opts.symbol0,
        symbol1: opts.symbol1,
      }),
      new Promise<number>((resolve) => setTimeout(() => resolve(0), 4_000)),
    ])
  } catch (error) {
    if (!isNetworkDnsError(error)) {
      console.warn("[market-poller] graph", error)
    }
  }

  if (cg > 0 && graphCount > 0) return { count: cg + graphCount, source: "graph+coingecko" }
  if (cg > 0) return { count: cg, source: "coingecko" }
  if (graphCount > 0) return { count: graphCount, source: "graph" }
  throw new Error("No market data from CoinGecko or The Graph")
}

/**
 * Background poller — live terminal feed without Substreams gRPC in the Next bundle.
 */
export function startMarketPoller(opts: {
  chainId?: number
  intervalMs?: number
  symbol0?: string
  symbol1?: string
  userId?: string | null
}): StreamHandle {
  const chainId = opts.chainId ?? 1
  const baseIntervalMs = opts.intervalMs ?? 8_000
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let failStreak = 0
  let lastWarnAt = 0

  const tick = async () => {
    if (stopped) return
    try {
      await pollMarketOnce({
        chainId,
        symbol0: opts.symbol0,
        symbol1: opts.symbol1,
        userId: opts.userId,
      })
      failStreak = 0
    } catch (error) {
      failStreak += 1
      const now = Date.now()
      if (now - lastWarnAt > 30_000) {
        lastWarnAt = now
        console.warn("[market-poller]", error)
      }
    }
    if (!stopped) {
      const backoff = Math.min(
        baseIntervalMs * Math.pow(2, Math.min(failStreak, 4)),
        60_000
      )
      const delay = failStreak > 0 ? backoff : baseIntervalMs
      timer = setTimeout(tick, delay)
    }
  }

  void tick()

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}
