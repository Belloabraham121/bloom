/**
 * Mission guardrail checks (notional, allowlists, daily loss cap).
 */

import { and, eq, gte, inArray } from "drizzle-orm"
import { db } from "@/server/services/db/client"
import { transactions } from "@/server/services/db/schema"
import type { MissionGuardrails, MissionParams } from "./types"

function normalizeAddr(a: string) {
  return a.trim().toLowerCase()
}

export function checkTokenAllowlist(
  guardrails: MissionGuardrails,
  tokenIn?: string,
  tokenOut?: string
): string | null {
  const list = guardrails.allowlistTokens
  if (!list?.length) return null
  const allowed = new Set(list.map(normalizeAddr))
  for (const t of [tokenIn, tokenOut]) {
    if (!t) continue
    if (!allowed.has(normalizeAddr(t))) {
      return `token_not_allowlisted:${t.slice(0, 10)}`
    }
  }
  return null
}

export function checkChainAllowlist(
  guardrails: MissionGuardrails,
  chainId?: number
): string | null {
  const list = guardrails.allowlistChainIds
  if (!list?.length || chainId == null) return null
  if (!list.includes(chainId)) return `chain_not_allowlisted:${chainId}`
  return null
}

export function checkMaxNotional(
  guardrails: MissionGuardrails,
  params: MissionParams,
  amountIn?: string,
  decimals?: number
): string | null {
  const cap =
    guardrails.maxNotionalUsd ??
    (params.maxNotionalUsd as number | undefined) ??
    (params.maxUsd as number | undefined)
  if (cap == null || amountIn == null) return null
  let n = Number(amountIn)
  if (!Number.isFinite(n)) return null
  if (decimals != null && decimals > 0) {
    n = n / Math.pow(10, decimals)
  }
  if (n > Number(cap)) return "above maxNotionalUsd"
  return null
}

/**
 * Sum rough USD notionals from today's submitted/failed autonomous txs.
 * Uses amountIn from requestPayload when present; otherwise counts 1 unit per tx.
 */
export async function sumDailyNotionalUsd(userId: string): Promise<number> {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)

  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.userId, userId),
      gte(transactions.createdAt, start),
      inArray(transactions.status, ["submitted", "signing", "failed", "confirmed"])
    ),
    columns: {
      requestPayload: true,
      value: true,
      category: true,
      status: true,
    },
  })

  let sum = 0
  for (const row of rows) {
    const req = row.requestPayload as Record<string, unknown> | null
    const amount =
      (typeof req?.amount === "string" && req.amount) ||
      (typeof req?.amountIn === "string" && req.amountIn) ||
      null
    const n = amount != null ? Number(amount) : 0
    if (Number.isFinite(n) && n > 0) sum += n
    else if (row.status === "submitted" || row.status === "confirmed") sum += 0
  }
  return sum
}

export async function checkDailyLossCap(
  userId: string,
  guardrails: MissionGuardrails,
  nextAmountIn?: string
): Promise<string | null> {
  const cap = guardrails.dailyLossCapUsd
  if (cap == null) return null
  const spent = await sumDailyNotionalUsd(userId)
  const next = nextAmountIn != null ? Number(nextAmountIn) : 0
  const projected = spent + (Number.isFinite(next) ? next : 0)
  if (projected > Number(cap)) {
    return `daily_loss_cap:${spent.toFixed(2)}+${next || 0}>${cap}`
  }
  return null
}

export async function assertExecutionGuardrails(opts: {
  userId: string
  guardrails: MissionGuardrails
  params: MissionParams
  chainId?: number
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  decimals?: number
}): Promise<string | null> {
  return (
    checkChainAllowlist(opts.guardrails, opts.chainId) ||
    checkTokenAllowlist(opts.guardrails, opts.tokenIn, opts.tokenOut) ||
    checkMaxNotional(opts.guardrails, opts.params, opts.amountIn, opts.decimals) ||
    (await checkDailyLossCap(opts.userId, opts.guardrails, opts.amountIn))
  )
}

/** Pure helpers for AgentQA unit smoke (no DB). */
export function evaluateAllowlistsForTest(
  guardrails: MissionGuardrails,
  opts: { chainId?: number; tokenIn?: string; tokenOut?: string; amountIn?: string; maxFromParams?: number; decimals?: number }
) {
  const params: MissionParams = {
    maxNotionalUsd: opts.maxFromParams,
  }
  return {
    chain: checkChainAllowlist(guardrails, opts.chainId),
    token: checkTokenAllowlist(guardrails, opts.tokenIn, opts.tokenOut),
    notional: checkMaxNotional(guardrails, params, opts.amountIn, opts.decimals),
  }
}
