/**
 * CoinGecko token logo resolution with caching + rate limiting.
 *
 * Env:
 * - COINGECKO_API_KEY (required for enrichment)
 * - COINGECKO_API_PLAN = "demo" | "pro" (default demo)
 * - COINGECKO_MAX_RPM — requests/minute budget (default: demo 50, pro 200)
 */

import { getCoinGeckoNetwork } from "./networks"
import { SlidingWindowRateLimiter, sleep } from "./rate-limit"

const LOGO_TTL_MS = 24 * 60 * 60 * 1000
const NEGATIVE_TTL_MS = 2 * 60 * 60 * 1000
const MULTI_BATCH_SIZE = 30
const MAX_RETRIES = 3

type CacheEntry = { logoUrl: string | null; expiresAt: number }

const logoCache = new Map<string, CacheEntry>()

let limiter: SlidingWindowRateLimiter | null = null

function plan(): "demo" | "pro" {
  const raw = (process.env.COINGECKO_API_PLAN || "demo").toLowerCase()
  return raw === "pro" ? "pro" : "demo"
}

function apiKey(): string | null {
  const key = process.env.COINGECKO_API_KEY?.trim()
  return key || null
}

function baseUrl(): string {
  return plan() === "pro"
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3"
}

function authHeaders(): HeadersInit {
  const key = apiKey()
  if (!key) return {}
  return plan() === "pro"
    ? { "x-cg-pro-api-key": key }
    : { "x-cg-demo-api-key": key }
}

function maxRpm(): number {
  const fromEnv = Number(process.env.COINGECKO_MAX_RPM)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv)
  // Leave headroom under CoinGecko published caps (demo 100, paid often 300+).
  return plan() === "pro" ? 200 : 50
}

function getLimiter(): SlidingWindowRateLimiter {
  if (!limiter) limiter = new SlidingWindowRateLimiter(maxRpm(), 60_000)
  return limiter
}

function cacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`
}

function readCache(chainId: number, address: string): string | null | undefined {
  const entry = logoCache.get(cacheKey(chainId, address))
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    logoCache.delete(cacheKey(chainId, address))
    return undefined
  }
  return entry.logoUrl
}

function writeCache(chainId: number, address: string, logoUrl: string | null) {
  logoCache.set(cacheKey(chainId, address), {
    logoUrl,
    expiresAt: Date.now() + (logoUrl ? LOGO_TTL_MS : NEGATIVE_TTL_MS),
  })
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value)
}

function extractLogoFromAttributes(attrs: Record<string, unknown> | undefined): string | null {
  if (!attrs) return null
  if (isHttpUrl(attrs.image_url)) return attrs.image_url
  const image = attrs.image as Record<string, unknown> | undefined
  if (image) {
    for (const key of ["large", "small", "thumb"] as const) {
      if (isHttpUrl(image[key])) return image[key] as string
    }
  }
  return null
}

async function geckoFetch(path: string): Promise<Response> {
  const limiter = getLimiter()
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await limiter.acquire()
    try {
      const res = await fetch(`${baseUrl()}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
      })

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"))
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1500 * (attempt + 1)
        console.warn("[coingecko] rate limited, backing off", { waitMs, attempt })
        await sleep(waitMs)
        continue
      }

      return res
    } catch (error) {
      lastError = error
      await sleep(300 * (attempt + 1))
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("CoinGecko request failed after retries")
}

/** Batch onchain token payloads; image_url when GeckoTerminal has one. */
async function fetchMultiOnchainLogos(
  network: string,
  addresses: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!addresses.length) return out

  const joined = addresses.map((a) => a.toLowerCase()).join(",")
  const res = await geckoFetch(
    `/onchain/networks/${encodeURIComponent(network)}/tokens/multi/${joined}`
  )

  if (!res.ok) {
    console.warn("[coingecko] multi tokens failed", {
      network,
      status: res.status,
      count: addresses.length,
    })
    return out
  }

  const json = (await res.json()) as {
    data?: Array<{
      attributes?: Record<string, unknown>
    }>
  }

  for (const item of json.data ?? []) {
    const attrs = item.attributes
    const address =
      typeof attrs?.address === "string" ? attrs.address.toLowerCase() : null
    const logo = extractLogoFromAttributes(attrs)
    if (address && logo) out.set(address, logo)
  }

  return out
}

/** Single-token metadata (richer image coverage). */
async function fetchTokenInfoLogo(
  network: string,
  address: string
): Promise<string | null> {
  const res = await geckoFetch(
    `/onchain/networks/${encodeURIComponent(network)}/tokens/${address.toLowerCase()}/info`
  )
  if (res.status === 404) return null
  if (!res.ok) {
    console.warn("[coingecko] token info failed", {
      network,
      address,
      status: res.status,
    })
    return null
  }

  const json = (await res.json()) as {
    data?: { attributes?: Record<string, unknown> }
  }
  return extractLogoFromAttributes(json.data?.attributes)
}

/** Classic CoinGecko listing — high-quality logos for indexed coins. */
async function fetchClassicContractLogo(
  platform: string,
  address: string
): Promise<string | null> {
  const res = await geckoFetch(
    `/coins/${encodeURIComponent(platform)}/contract/${address.toLowerCase()}`
  )
  if (res.status === 404) return null
  if (!res.ok) {
    console.warn("[coingecko] contract coin failed", {
      platform,
      address,
      status: res.status,
    })
    return null
  }

  const json = (await res.json()) as {
    image?: { large?: string; small?: string; thumb?: string }
  }
  const image = json.image
  if (isHttpUrl(image?.large)) return image!.large!
  if (isHttpUrl(image?.small)) return image!.small!
  if (isHttpUrl(image?.thumb)) return image!.thumb!
  return null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Resolve logos for addresses missing from Uniswap enrichment.
 * Respects rate limits; caches hits and misses.
 */
export async function resolveCoinGeckoLogos(
  chainId: number,
  addresses: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!apiKey()) return result

  const network = getCoinGeckoNetwork(chainId)
  if (!network) return result

  const unique = [
    ...new Set(
      addresses
        .map((a) => a.toLowerCase())
        .filter((a) => a.startsWith("0x") && a.length === 42)
    ),
  ]

  const needFetch: string[] = []
  for (const address of unique) {
    const cached = readCache(chainId, address)
    if (cached === undefined) {
      needFetch.push(address)
    } else if (cached) {
      result.set(address, cached)
    }
  }

  if (!needFetch.length) return result

  // 1) Batch onchain multi (1 call / up to 30 addresses)
  for (const batch of chunk(needFetch, MULTI_BATCH_SIZE)) {
    try {
      const logos = await fetchMultiOnchainLogos(network.onchain, batch)
      for (const address of batch) {
        const logo = logos.get(address) ?? null
        if (logo) {
          writeCache(chainId, address, logo)
          result.set(address, logo)
        }
      }
    } catch (error) {
      console.warn("[coingecko] multi batch error", {
        chainId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  // 2) Fill remaining via /info (rate-limited). Cap to protect latency + RPM.
  const MAX_SINGLE_LOOKUPS = 15
  const stillMissing = needFetch.filter((a) => !result.has(a)).slice(0, MAX_SINGLE_LOOKUPS)
  for (const address of stillMissing) {
    let logo: string | null = null
    try {
      logo = await fetchTokenInfoLogo(network.onchain, address)
      if (!logo) {
        logo = await fetchClassicContractLogo(network.platform, address)
      }
    } catch (error) {
      console.warn("[coingecko] single logo error", {
        chainId,
        address,
        error: error instanceof Error ? error.message : error,
      })
    }
    writeCache(chainId, address, logo)
    if (logo) result.set(address, logo)
  }

  // Negative-cache the rest of this batch so we don't re-stampede.
  for (const address of needFetch) {
    if (!result.has(address) && readCache(chainId, address) === undefined) {
      writeCache(chainId, address, null)
    }
  }

  return result
}

export function isCoinGeckoConfigured(): boolean {
  return Boolean(apiKey())
}
