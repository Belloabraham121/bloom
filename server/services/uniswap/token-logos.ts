/**
 * Resolve token logo URLs: Uniswap Trading API first, CoinGecko for gaps.
 */

import { tradeClient, type DecisionOrigin } from "@/server/services/uniswap/trade.client"
import {
  isCoinGeckoConfigured,
  resolveCoinGeckoLogos,
} from "@/server/services/coingecko/logos"

type LogoCacheEntry = {
  expiresAt: number
  byAddress: Map<string, string>
}

const CACHE_TTL_MS = 30 * 60 * 1000
const uniswapLogoCache = new Map<number, LogoCacheEntry>()

function extractLogoUrl(token: Record<string, unknown>): string | null {
  const project = token.project as { logo?: { url?: string } } | undefined
  const fromProject = project?.logo?.url
  if (typeof fromProject === "string" && fromProject.startsWith("http")) {
    return fromProject
  }
  for (const key of ["logoUrl", "logoURI", "logo"] as const) {
    const v = token[key]
    if (typeof v === "string" && v.startsWith("http")) return v
  }
  return null
}

function extractAddress(token: Record<string, unknown>): string | null {
  const addr = token.address ?? token.id
  return typeof addr === "string" && addr.length > 0 ? addr.toLowerCase() : null
}

async function loadUniswapLogoMap(
  chainId: number,
  decisionOrigin: DecisionOrigin
): Promise<Map<string, string>> {
  const cached = uniswapLogoCache.get(chainId)
  if (cached && cached.expiresAt > Date.now()) return cached.byAddress

  const byAddress = new Map<string, string>()
  try {
    const raw = (await tradeClient.swappableTokens(
      { chainId },
      decisionOrigin
    )) as { tokens?: Array<Record<string, unknown>> }

    for (const token of raw.tokens ?? []) {
      const address = extractAddress(token)
      const logo = extractLogoUrl(token)
      if (address && logo) byAddress.set(address, logo)
    }
  } catch (error) {
    console.warn("[token-logos] Failed to load Uniswap swappable tokens", {
      chainId,
      error: error instanceof Error ? error.message : error,
    })
  }

  uniswapLogoCache.set(chainId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    byAddress,
  })
  return byAddress
}

/** Attach logoUrl onto token-like rows that have an address/id. */
export async function attachTokenLogos<
  T extends { id?: string; address?: string },
>(
  chainId: number,
  tokens: T[],
  decisionOrigin: DecisionOrigin = "human_mediated"
): Promise<Array<T & { logoUrl: string | null }>> {
  if (!tokens.length) return []

  const uniswap = await loadUniswapLogoMap(chainId, decisionOrigin)

  const missing: string[] = []
  for (const token of tokens) {
    const key = (token.address || token.id || "").toLowerCase()
    if (key && !uniswap.get(key)) missing.push(key)
  }

  const gecko =
    missing.length && isCoinGeckoConfigured()
      ? await resolveCoinGeckoLogos(chainId, missing)
      : new Map<string, string>()

  return tokens.map((token) => {
    const key = (token.address || token.id || "").toLowerCase()
    const logoUrl =
      (key && (uniswap.get(key) || gecko.get(key))) || null
    return { ...token, logoUrl }
  })
}

/** Normalize Trading API token lists so agents always see logoUrl (+ CoinGecko fill). */
export async function normalizeTradingApiTokens(
  payload: unknown,
  chainId?: number
): Promise<unknown> {
  if (!payload || typeof payload !== "object") return payload
  const data = payload as Record<string, unknown>
  const list = data.tokens
  if (!Array.isArray(list)) return payload

  const withUniswapLogos = list.map((item) => {
    if (!item || typeof item !== "object") return item
    const token = item as Record<string, unknown>
    return {
      ...token,
      logoUrl: extractLogoUrl(token),
    }
  })

  if (!chainId || !isCoinGeckoConfigured()) {
    return { ...data, tokens: withUniswapLogos }
  }

  const missing = withUniswapLogos
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const token = item as Record<string, unknown>
      if (token.logoUrl) return null
      return extractAddress(token)
    })
    .filter((a): a is string => Boolean(a))

  if (!missing.length) {
    return { ...data, tokens: withUniswapLogos }
  }

  const gecko = await resolveCoinGeckoLogos(chainId, missing)
  return {
    ...data,
    tokens: withUniswapLogos.map((item) => {
      if (!item || typeof item !== "object") return item
      const token = item as Record<string, unknown>
      if (token.logoUrl) return token
      const address = extractAddress(token)
      const logoUrl = (address && gecko.get(address)) || null
      return { ...token, logoUrl }
    }),
  }
}
