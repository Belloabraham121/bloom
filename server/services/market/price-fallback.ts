/**
 * Price ticks via CoinGecko simple/price (fallback when The Graph is unreachable).
 */

import { publishMarketEvent, publishAgentEvent } from "@/server/services/market/bus"

function cgBaseUrl() {
  const plan = (process.env.COINGECKO_API_PLAN || "demo").toLowerCase()
  return plan === "pro"
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3"
}

function cgHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY?.trim()
  if (!key) return {}
  const plan = (process.env.COINGECKO_API_PLAN || "demo").toLowerCase()
  return plan === "pro"
    ? { "x-cg-pro-api-key": key }
    : { "x-cg-demo-api-key": key }
}

const COIN_IDS: Record<string, string> = {
  eth: "ethereum",
  weth: "ethereum",
  ethereum: "ethereum",
  usdc: "usd-coin",
  usdt: "tether",
  dai: "dai",
  btc: "bitcoin",
  wbtc: "bitcoin",
}

const lastAgentByUser = new Map<string, { at: number; message: string }>()

async function fetchWithTimeout(url: string, ms = 15_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, {
      headers: { Accept: "application/json", ...cgHeaders() },
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function pollCoinGeckoPriceOnce(opts: {
  chainId?: number
  symbol0?: string
  symbol1?: string
  userId?: string | null
}): Promise<number> {
  const chainId = opts.chainId ?? 1
  const s0 = (opts.symbol0 || "USDC").toLowerCase()
  const s1 = (opts.symbol1 || "ETH").toLowerCase()
  const id0 = COIN_IDS[s0] || "usd-coin"
  const id1 = COIN_IDS[s1] || "ethereum"
  const ids = [...new Set([id0, id1])].join(",")

  const url = `${cgBaseUrl()}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`

  let res: Response
  try {
    res = await fetchWithTimeout(url, 15_000)
  } catch (error) {
    // one retry after short delay
    await new Promise((r) => setTimeout(r, 500))
    res = await fetchWithTimeout(url, 15_000)
  }

  if (!res.ok) {
    throw new Error(`CoinGecko price failed (${res.status})`)
  }
  const json = (await res.json()) as Record<string, { usd?: number }>
  const p0 = json[id0]?.usd
  const p1 = json[id1]?.usd
  if (p0 == null || p1 == null || p0 === 0) {
    throw new Error("CoinGecko missing USD prices")
  }

  const pairPrice = p1 / p0
  const display0 = (opts.symbol0 || "USDC").toUpperCase()
  const display1 = (opts.symbol1 || "ETH").toUpperCase()

  await publishMarketEvent({
    chainId,
    pool: `coingecko:${id0}/${id1}`,
    symbol0: display0,
    symbol1: display1,
    price: pairPrice.toFixed(6),
    amount0: String(p0),
    amount1: String(p1),
  })

  if (opts.userId) {
    const message = `${display1}/${display0} ${pairPrice.toFixed(2)} · ${display1} $${p1.toLocaleString()}`
    const prev = lastAgentByUser.get(opts.userId)
    const now = Date.now()
    if (!prev || prev.message !== message || now - prev.at > 20_000) {
      lastAgentByUser.set(opts.userId, { at: now, message })
      await publishAgentEvent({
        userId: opts.userId,
        step: "signal",
        message,
        payload: { source: "coingecko", p0, p1, pairPrice },
      })
    }
  }

  return 1
}
