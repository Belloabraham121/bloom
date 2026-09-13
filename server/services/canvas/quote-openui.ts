/**
 * Build OpenUI fragment + preparedJson for the quote CanvasSlot.
 */

import { extractTxFields } from "@/server/services/wallet/executor"

export function escapeOpenuiString(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function humanAmountFromBase(amount: string, decimals: number): string {
  if (!/^\d+$/.test(amount)) return amount
  if (amount.length <= decimals) {
    const padded = amount.padStart(decimals + 1, "0")
    const whole = padded.slice(0, -decimals) || "0"
    const frac = padded.slice(-decimals).replace(/0+$/, "")
    return frac ? `${Number(whole)}.${frac}` : String(Number(whole))
  }
  const whole = amount.slice(0, -decimals) || "0"
  const frac = amount.slice(-decimals).replace(/0+$/, "")
  return frac ? `${whole}.${frac}` : whole
}

function pickOutputAmount(quote: Record<string, unknown>): string {
  const nested = quote.quote as Record<string, unknown> | undefined
  const candidates = [
    quote.output,
    quote.amountOut,
    nested?.output,
    nested?.amountOut,
    (nested?.output as Record<string, unknown> | undefined)?.amount,
    (quote.output as Record<string, unknown> | undefined)?.amount,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c) return c
    if (typeof c === "number" && Number.isFinite(c)) return String(c)
  }
  return "—"
}

export function buildPreparedJsonFromSwapResult(
  result: unknown,
  fallbackChainId: number
): string | null {
  const fields = extractTxFields(result)
  if (!fields.to || !fields.data) return null
  return JSON.stringify({
    chainId: fields.chainId ?? fallbackChainId,
    to: fields.to,
    data: fields.data,
    value: fields.value || "0x0",
    category: "swap",
  })
}

export function buildQuoteSlotOpenui(opts: {
  symbolIn: string
  symbolOut: string
  amountInHuman: string
  amountOutDisplay: string
  routing: string
  gasUsd?: string
  chainName?: string
  preparedJson: string | null
  summary: string
}): string {
  const gas = opts.gasUsd || "—"
  const chain = opts.chainName || "Ethereum"
  const preparedArg = opts.preparedJson
    ? `"${escapeOpenuiString(opts.preparedJson)}"`
    : "null"
  const confirm = opts.preparedJson
    ? `confirm = ConfirmTx("Confirm swap", "${escapeOpenuiString(opts.summary)}", null, ${preparedArg}, true)`
    : `confirm = MessageText("This quote uses a gasless route (UniswapX). Gasless order signing is not yet supported in Bloom.")`
  return `Stack([caption, quote, cost, confirm])
caption = TextContent("Quote ready", "large-heavy")
quote = QuoteSummary("${escapeOpenuiString(opts.symbolIn)}", "${escapeOpenuiString(opts.symbolOut)}", "${escapeOpenuiString(opts.amountInHuman)}", "${escapeOpenuiString(opts.amountOutDisplay)}", "${escapeOpenuiString(opts.routing || "CLASSIC")}", "${escapeOpenuiString(gas)}", "${escapeOpenuiString(chain)}")
cost = CostBreakdown("${escapeOpenuiString(gas)}")
${confirm}`
}

export function estimateAmountOutDisplay(
  quote: Record<string, unknown>,
  tokenOutDecimals = 18
): string {
  const raw = pickOutputAmount(quote)
  if (raw === "—" || !/^\d+$/.test(raw)) return raw
  try {
    return humanAmountFromBase(raw, tokenOutDecimals)
  } catch {
    return raw
  }
}
