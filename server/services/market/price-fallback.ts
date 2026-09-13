/**
 * Spot price for watched pairs — CoinGecko → DefiLlama → Binance.
 * Soft-fails on network timeouts so the poller does not spam / hang.
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

/** DefiLlama coingecko:* ids (same mapping). */
const LLAMA_IDS = COIN_IDS

/** Binance spot symbols for common quote pairs (symbol1 in terms of symbol0 ≈ USDT). */
const BINANCE_BASE: Record<string, string> = {
  eth: "ETH",
  weth: "ETH",
  btc: "BTC",
  wbtc: "BTC",
}

const lastAgentByUser = new Map<string, { at: number; message: string }>()
let lastPriceWarnAt = 0

async function fetchWithTimeout(
  url: string,
  ms = 6_000,
  headers: HeadersInit = { Accept: "application/json" }
) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { headers, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function warnPrice(source: string, error: unknown) {
  const now = Date.now()
  if (now - lastPriceWarnAt < 45_000) return
  lastPriceWarnAt = now
  const msg = error instanceof Error ? error.message : String(error)
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : null
  const causeMsg =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: string }).code)
      : cause instanceof Error
        ? cause.message
        : ""
  console.warn(
    `[market-price] ${source} unavailable${causeMsg ? ` (${causeMsg})` : ""}: ${msg}`
  )
}

async function publishPairTick(opts: {
  chainId: number
  symbol0: string
  symbol1: string
  pairPrice: number
  usd0: number
  usd1: number
  source: string
  userId?: string | null
  poolTag: string
}) {
  const display0 = opts.symbol0.toUpperCase()
  const display1 = opts.symbol1.toUpperCase()

  await publishMarketEvent({
    chainId: opts.chainId,
    pool: opts.poolTag,
    symbol0: display0,
    symbol1: display1,
    price: opts.pairPrice.toFixed(6),
    amount0: String(opts.usd0),
    amount1: String(opts.usd1),
  })

  if (opts.userId) {
    const message = `${display1}/${display0} ${opts.pairPrice.toFixed(2)} · ${display1} $${opts.usd1.toLocaleString()}`
    const prev = lastAgentByUser.get(opts.userId)
    const now = Date.now()
    if (!prev || prev.message !== message || now - prev.at > 20_000) {
      lastAgentByUser.set(opts.userId, { at: now, message })
      await publishAgentEvent({
        userId: opts.userId,
        step: "signal",
        message,
        payload: {
          source: opts.source,
          p0: opts.usd0,
          p1: opts.usd1,
          pairPrice: opts.pairPrice,
        },
      })
    }
  }
}

async function fromCoinGecko(
  id0: string,
  id1: string
): Promise<{ p0: number; p1: number } | null> {
  const ids = [...new Set([id0, id1])].join(",")
  const url = `${cgBaseUrl()}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`
  try {
    const res = await fetchWithTimeout(url, 6_000, {
      Accept: "application/json",
      ...cgHeaders(),
    })
    if (!res.ok) return null
    const json = (await res.json()) as Record<string, { usd?: number }>
    const p0 = json[id0]?.usd
    const p1 = json[id1]?.usd
    if (p0 == null || p1 == null || p0 === 0) return null
    return { p0, p1 }
  } catch (error) {
    warnPrice("coingecko", error)
    return null
  }
}

async function fromDefiLlama(
  id0: string,
  id1: string
): Promise<{ p0: number; p1: number } | null> {
  const coins = [...new Set([id0, id1])].map((id) => `coingecko:${id}`).join(",")
  const url = `https://coins.llama.fi/prices/current/${coins}`
  try {
    const res = await fetchWithTimeout(url, 6_000)
    if (!res.ok) return null
    const json = (await res.json()) as {
      coins?: Record<string, { price?: number }>
    }
    const p0 = json.coins?.[`coingecko:${id0}`]?.price
    const p1 = json.coins?.[`coingecko:${id1}`]?.price
    if (p0 == null || p1 == null || p0 === 0) return null
    return { p0, p1 }
  } catch (error) {
    warnPrice("defillama", error)
    return null
  }
}

async function fromBinance(
  s0: string,
  s1: string
): Promise<{ p0: number; p1: number; pairPrice: number } | null> {
  const base = BINANCE_BASE[s1]
  if (!base) return null
  // Treat USDC/USDT/DAI as ~$1 quote
  const stable = new Set(["usdc", "usdt", "dai"])
  if (!stable.has(s0)) return null
  const symbol = `${base}USDT`
  try {
    const res = await fetchWithTimeout(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      5_000
    )
    if (!res.ok) return null
    const json = (await res.json()) as { price?: string }
    const p1 = Number(json.price)
    if (!Number.isFinite(p1) || p1 <= 0) return null
    return { p0: 1, p1, pairPrice: p1 }
  } catch (error) {
    warnPrice("binance", error)
    return null
  }
}

/**
 * Fetch one spot price pair without publishing. Returns the first reachable
 * source so demo feeds can share the same real prices as live market ingest.
 */
export async function fetchSpotPrices(
  symbol0: string,
  symbol1: string
): Promise<{
  p0: number;
  p1: number;
  pairPrice: number;
  source: "coingecko" | "defillama" | "binance";
} | null> {
  const s0 = (symbol0 || "USDC").toLowerCase();
  const s1 = (symbol1 || "ETH").toLowerCase();
  const id0 = LLAMA_IDS[s0] || "usd-coin";
  const id1 = LLAMA_IDS[s1] || "ethereum";

  const cg = await fromCoinGecko(id0, id1);
  if (cg) {
    return { p0: cg.p0, p1: cg.p1, pairPrice: cg.p1 / cg.p0, source: "coingecko" };
  }

  const llama = await fromDefiLlama(id0, id1);
  if (llama) {
    return { p0: llama.p0, p1: llama.p1, pairPrice: llama.p1 / llama.p0, source: "defillama" };
  }

  const binance = await fromBinance(s0, s1);
  if (binance) {
    return { p0: binance.p0, p1: binance.p1, pairPrice: binance.pairPrice, source: "binance" };
  }

  return null;
}

/**
 * Publish one spot tick for the watched pair. Returns 1 on success, 0 on soft failure.
 */
export async function pollCoinGeckoPriceOnce(opts: {
  chainId?: number
  symbol0?: string
  symbol1?: string
  userId?: string | null
}): Promise<number> {
  const chainId = opts.chainId ?? 1
  const s0 = (opts.symbol0 || "USDC").toLowerCase()
  const s1 = (opts.symbol1 || "ETH").toLowerCase()
  const id0 = LLAMA_IDS[s0] || "usd-coin"
  const id1 = LLAMA_IDS[s1] || "ethereum"
  const display0 = (opts.symbol0 || "USDC").toUpperCase()
  const display1 = (opts.symbol1 || "ETH").toUpperCase()

  const cg = await fromCoinGecko(id0, id1)
  if (cg) {
    await publishPairTick({
      chainId,
      symbol0: display0,
      symbol1: display1,
      pairPrice: cg.p1 / cg.p0,
      usd0: cg.p0,
      usd1: cg.p1,
      source: "coingecko",
      userId: opts.userId,
      poolTag: `coingecko:${id0}/${id1}`,
    })
    return 1
  }

  const llama = await fromDefiLlama(id0, id1)
  if (llama) {
    await publishPairTick({
      chainId,
      symbol0: display0,
      symbol1: display1,
      pairPrice: llama.p1 / llama.p0,
      usd0: llama.p0,
      usd1: llama.p1,
      source: "defillama",
      userId: opts.userId,
      poolTag: `defillama:${id0}/${id1}`,
    })
    return 1
  }

  const binance = await fromBinance(s0, s1)
  if (binance) {
    await publishPairTick({
      chainId,
      symbol0: display0,
      symbol1: display1,
      pairPrice: binance.pairPrice,
      usd0: binance.p0,
      usd1: binance.p1,
      source: "binance",
      userId: opts.userId,
      poolTag: `binance:${s1}/${s0}`,
    })
    return 1
  }

  return 0
}
