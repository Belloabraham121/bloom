/**
 * Normalize Trading API /quote bodies so agent mistakes (symbols, human amounts,
 * numeric chainIds) still succeed when possible.
 */

import type { AgentMode } from "@/lib/types"
import { tradeClient } from "@/server/services/uniswap/trade.client"

const NATIVE = "0x0000000000000000000000000000000000000000"

/** Well-known mainnet (and common L2) addresses for fast path without /tokens. */
const KNOWN: Record<
  number,
  Record<string, { address: string; decimals: number }>
> = {
  1: {
    ETH: { address: NATIVE, decimals: 18 },
    WETH: {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      decimals: 18,
    },
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
    },
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
    },
    DAI: {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      decimals: 18,
    },
    WBTC: {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      decimals: 8,
    },
  },
  8453: {
    ETH: { address: NATIVE, decimals: 18 },
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      decimals: 18,
    },
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
    },
  },
  42161: {
    ETH: { address: NATIVE, decimals: 18 },
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18,
    },
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
    },
  },
}

function isAddress(v: unknown): v is string {
  return typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v)
}

function chainIdOf(body: Record<string, unknown>, key: string): number {
  const raw = body[key] ?? body.chainId ?? 1
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function toBaseUnits(amount: string, decimals: number): string {
  const t = amount.trim()
  if (!t) throw new Error("amount is required")
  if (/^\d+$/.test(t) && !t.includes(".")) {
    // Already integer — if it looks like human (small) and decimals>0, still treat as human when short?
    // Heuristic: values with a decimal point are human; pure integers >= 1e6 for USDC-like may already be base.
    // Prefer: if length suggests wei ( > decimals+2 digits for common sizes), keep as-is.
    if (t.length > decimals + 2) return t
  }
  const [wholeRaw, fracRaw = ""] = t.split(".")
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0"
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals)
  const combined = `${whole}${frac}`.replace(/^0+(?=\d)/, "") || "0"
  return combined
}

async function resolveToken(
  chainId: number,
  value: unknown,
  decisionOrigin: AgentMode
): Promise<{ address: string; decimals: number; symbol?: string }> {
  if (isAddress(value)) {
    const known = Object.values(KNOWN[chainId] || {}).find(
      (t) => t.address.toLowerCase() === value.toLowerCase()
    )
    return {
      address: value,
      decimals: known?.decimals ?? 18,
      symbol: known ? undefined : undefined,
    }
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("tokenIn/tokenOut must be a 0x address or symbol")
  }
  const sym = value.trim().toUpperCase()
  const hit = KNOWN[chainId]?.[sym]
  if (hit) return { ...hit, symbol: sym }

  const data = await tradeClient.tokens(
    { chainId, search: sym },
    decisionOrigin
  )
  const list = Array.isArray(data)
    ? data
    : ((data as { tokens?: unknown[] })?.tokens ?? [])
  const match = (list as Array<Record<string, unknown>>).find((t) => {
    const s = String(t.symbol || "").toUpperCase()
    return s === sym && isAddress(t.address)
  })
  if (!match || !isAddress(match.address)) {
    throw new Error(
      `Could not resolve token "${value}" on chain ${chainId}. Call get_tokens first with a contract address.`
    )
  }
  const decimals =
    typeof match.decimals === "number"
      ? match.decimals
      : Number(match.decimals) || 18
  return { address: match.address, decimals, symbol: sym }
}

export type ResolvedToken = { address: string; decimals: number; symbol?: string }

export type NormalizeQuoteResult = {
  body: Record<string, unknown>
  warnings: string[]
  tokenIn: ResolvedToken
  tokenOut: ResolvedToken
}

/**
 * Coerce a loosely-shaped agent quote body into Trading API /quote form.
 */
export async function normalizeQuoteBody(
  raw: Record<string, unknown>,
  opts: { decisionOrigin: AgentMode; swapper?: string | null }
): Promise<NormalizeQuoteResult> {
  const warnings: string[] = []
  const body: Record<string, unknown> = { ...raw }

  const tokenInChainId = chainIdOf(body, "tokenInChainId")
  const tokenOutChainId = chainIdOf(body, "tokenOutChainId")

  const tokenInRaw = body.tokenIn ?? body.token0 ?? body.sellToken
  const tokenOutRaw = body.tokenOut ?? body.token1 ?? body.buyToken

  const tokenIn = await resolveToken(
    tokenInChainId,
    tokenInRaw,
    opts.decisionOrigin
  )
  const tokenOut = await resolveToken(
    tokenOutChainId,
    tokenOutRaw,
    opts.decisionOrigin
  )

  if (!isAddress(tokenInRaw)) {
    warnings.push(`Resolved tokenIn ${String(tokenInRaw)} → ${tokenIn.address}`)
  }
  if (!isAddress(tokenOutRaw)) {
    warnings.push(
      `Resolved tokenOut ${String(tokenOutRaw)} → ${tokenOut.address}`
    )
  }

  let amount = body.amount ?? body.amountIn ?? body.amountExact
  if (amount == null) {
    throw new Error("quote body requires amount (human decimal or base units)")
  }
  const amountStr = String(amount).trim()
  const looksHuman =
    amountStr.includes(".") ||
    (/^\d+$/.test(amountStr) && amountStr.length <= 8)
  const normalizedAmount = looksHuman
    ? toBaseUnits(amountStr, tokenIn.decimals)
    : amountStr.replace(/^0+(?=\d)/, "") || "0"
  if (normalizedAmount !== amountStr) {
    warnings.push(
      `Converted amount ${amountStr} → ${normalizedAmount} (${tokenIn.decimals} decimals)`
    )
  }

  body.type = body.type || "EXACT_INPUT"
  body.amount = normalizedAmount
  body.tokenIn = tokenIn.address
  body.tokenOut = tokenOut.address
  // Trading API examples use numeric or string; coerce to number (missions use number; probe with string also worked — keep number for mission parity, string also OK)
  body.tokenInChainId = tokenInChainId
  body.tokenOutChainId = tokenOutChainId

  if (!body.swapper && opts.swapper) {
    body.swapper = opts.swapper
  }
  if (!body.swapper || !isAddress(body.swapper)) {
    // Placeholder swapper — Uniswap accepts for quote routing; execution needs real wallet
    body.swapper = "0x0000000000000000000000000000000000000001"
    warnings.push("No wallet swapper — used placeholder for quote only")
  }

  delete body.token0
  delete body.token1
  delete body.sellToken
  delete body.buyToken
  delete body.amountIn
  delete body.amountExact
  delete body.chainId

  return { body, warnings, tokenIn, tokenOut }
}
