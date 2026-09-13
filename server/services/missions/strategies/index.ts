import type { MarketEvent } from "@/server/services/market/bus"
import type { MissionGuardrails, MissionParams, MissionStrategy } from "../types"
import { publishAgentEvent } from "@/server/services/market/bus"
import { patchCanvasForUser } from "@/server/services/canvas/store"
import { liquidityClient, tradeClient } from "@/server/services/uniswap/trade.client"
import { executePreparedTx } from "@/server/services/wallet/executor"
import {
  insertTradeIntent,
  updateTradeIntent,
} from "@/server/services/uniswap/intents.repo"
import { assertExecutionGuardrails } from "../guardrails"
import { db } from "@/server/services/db/client"
import { users, wallets } from "@/server/services/db/schema"
import { eq } from "drizzle-orm"
import type { AgentMode } from "@/lib/types"

export type StrategyContext = {
  missionId: string
  userId: string
  conversationId?: string | null
  strategy: MissionStrategy
  params: MissionParams
  guardrails: MissionGuardrails
  agentMode: AgentMode
  minEdgeBps: number
  lastRunAt?: number
  cooldownMs: number
}

export type StrategyResult = {
  acted: boolean
  message: string
}

export async function runStrategyOnEvent(
  ctx: StrategyContext,
  event: MarketEvent
): Promise<StrategyResult> {
  const now = Date.now()
  if (ctx.lastRunAt && now - ctx.lastRunAt < ctx.cooldownMs) {
    return { acted: false, message: "cooldown" }
  }

  switch (ctx.strategy) {
    case "watch":
      return runWatch(ctx, event)
    case "swap_dca":
      return runSwapDca(ctx, event)
    case "range_lp":
      return runRangeLp(ctx, event)
    case "arb_scan":
      return runArbScan(ctx, event)
    default:
      return { acted: false, message: "unknown strategy" }
  }
}

async function runWatch(
  _ctx: StrategyContext,
  _event: MarketEvent
): Promise<StrategyResult> {
  // Ticks already stream via market SSE → LiveMarketTick/Chart.
  // Do NOT patch canvas or publish agent signals here — that re-rendered the
  // whole OpenUI shell and flooded the activity dock on every poll.
  return { acted: false, message: "watched" }
}

async function getSwapper(userId: string) {
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.userId, userId),
  })
  return wallet?.address
}

async function quoteAndMaybeExecute(opts: {
  ctx: StrategyContext
  kind: string
  category: string
  chainId: number
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippageBps: number
}): Promise<StrategyResult> {
  const { ctx } = opts
  const user = await db.query.users.findFirst({
    where: eq(users.id, ctx.userId),
  })
  if (user?.agentKillSwitch) {
    return { acted: false, message: "kill_switch" }
  }

  const blocked = await assertExecutionGuardrails({
    userId: ctx.userId,
    guardrails: ctx.guardrails,
    params: ctx.params,
    chainId: opts.chainId,
    tokenIn: opts.tokenIn,
    tokenOut: opts.tokenOut,
    amountIn: opts.amountIn,
  })
  if (blocked) {
    await publishAgentEvent({
      userId: ctx.userId,
      missionId: ctx.missionId,
      step: "status",
      message: `Blocked by guardrail: ${blocked}`,
    })
    return { acted: false, message: blocked }
  }

  const swapper = await getSwapper(ctx.userId)

  await publishAgentEvent({
    userId: ctx.userId,
    missionId: ctx.missionId,
    step: "quoting",
    message: `Quoting ${opts.amountIn} ${opts.tokenIn.slice(0, 8)}→${opts.tokenOut.slice(0, 8)} (${opts.kind})`,
  })

  await patchCanvasForUser({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    patch: {
      op: "replace",
      widgetId: "inflight_trade",
      kind: "inflight_trade",
      data: {
        status: "quoting",
        tokenIn: opts.tokenIn,
        tokenOut: opts.tokenOut,
        amountIn: opts.amountIn,
        kind: opts.kind,
      },
    },
  })

  const intent = await insertTradeIntent({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    kind: opts.kind,
    status: "quoting",
    chainIdIn: opts.chainId,
    chainIdOut: opts.chainId,
    tokenIn: opts.tokenIn,
    tokenOut: opts.tokenOut,
    amountIn: opts.amountIn,
  })

  try {
    const quoteBody = {
      type: "EXACT_INPUT",
      amount: opts.amountIn,
      tokenInChainId: opts.chainId,
      tokenOutChainId: opts.chainId,
      tokenIn: opts.tokenIn,
      tokenOut: opts.tokenOut,
      swapper: swapper || undefined,
      slippageTolerance: opts.slippageBps / 100,
    }
    const quote = (await tradeClient.quote(quoteBody, "autonomous")) as Record<
      string,
      unknown
    >

    await updateTradeIntent(intent.id, {
      status: "quoted",
      quotePayload: quote,
      routing: quote.routing != null ? String(quote.routing) : null,
    })

    await publishAgentEvent({
      userId: ctx.userId,
      missionId: ctx.missionId,
      step: "deciding",
      message: `Quote routing=${String(quote.routing || "")}`,
      payload: { routing: quote.routing, intentId: intent.id, kind: opts.kind },
    })

    if (ctx.agentMode !== "autonomous") {
      await publishAgentEvent({
        userId: ctx.userId,
        missionId: ctx.missionId,
        step: "status",
        message: "Quote ready — enable autonomous or confirm to execute",
        payload: { quote, intentId: intent.id },
      })
      return { acted: true, message: "quoted_awaiting_confirm" }
    }

    const prepared = await tradeClient.prepareExecution({
      quote,
      decisionOrigin: "autonomous",
    })
    const resultPayload = prepared.result as Record<string, unknown>
    const swap = (resultPayload.swap || resultPayload) as Record<string, unknown>
    await updateTradeIntent(intent.id, {
      status: "preparing",
      calldataPayload: resultPayload,
    })
    const result = await executePreparedTx({
      userId: ctx.userId,
      agentMode: ctx.agentMode,
      requireAutonomous: true,
      prepared: {
        chainId: opts.chainId,
        to: String(swap.to || ""),
        data: String(swap.data || ""),
        value: swap.value != null ? String(swap.value) : "0x0",
        category: opts.category,
        responsePayload: resultPayload,
        requestPayload: { ...quoteBody, amount: opts.amountIn, amountIn: opts.amountIn },
        missionId: ctx.missionId,
        conversationId: ctx.conversationId,
        tradeIntentId: intent.id,
      },
    })

    await updateTradeIntent(intent.id, {
      status: result.ok ? "submitted" : "failed",
      error: result.ok ? null : result.error || "failed",
    })

    return {
      acted: result.ok,
      message: result.ok ? `submitted ${result.txHash}` : result.error || "failed",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateTradeIntent(intent.id, { status: "failed", error: message })
    await publishAgentEvent({
      userId: ctx.userId,
      missionId: ctx.missionId,
      step: "failed",
      message,
    })
    return { acted: false, message }
  }
}

async function runSwapDca(
  ctx: StrategyContext,
  event: MarketEvent
): Promise<StrategyResult> {
  const { tokenIn, tokenOut, amountIn, chainId = 1, slippageBps = 50 } =
    ctx.params
  if (!tokenIn || !tokenOut || !amountIn) {
    return { acted: false, message: "missing tokenIn/tokenOut/amountIn" }
  }

  if (ctx.params.priceThreshold && event.price) {
    const price = Number(event.price)
    const threshold = Number(ctx.params.priceThreshold)
    if (Number.isFinite(price) && Number.isFinite(threshold) && price > threshold) {
      return { acted: false, message: "price above threshold" }
    }
  }

  return quoteAndMaybeExecute({
    ctx,
    kind: "swap_dca",
    category: "swap_dca",
    chainId,
    tokenIn,
    tokenOut,
    amountIn,
    slippageBps,
  })
}

/**
 * When live price leaves [tickLower, tickUpper] proxy band (or priceThreshold band),
 * rebalance via swap if tokenIn/tokenOut/amountIn set; else try LP create when lpCreateBody present.
 */
async function runRangeLp(
  ctx: StrategyContext,
  event: MarketEvent
): Promise<StrategyResult> {
  const price = Number(event.price || 0)
  const lower = ctx.params.tickLower
  const upper = ctx.params.tickUpper
  const bandLow = ctx.params.priceBandLow != null ? Number(ctx.params.priceBandLow) : null
  const bandHigh =
    ctx.params.priceBandHigh != null ? Number(ctx.params.priceBandHigh) : null

  let outOfRange = false
  if (Number.isFinite(price) && price > 0) {
    if (bandLow != null && bandHigh != null) {
      outOfRange = price < bandLow || price > bandHigh
    } else if (lower != null && upper != null) {
      // Treat tick bounds as numeric price band when used that way
      outOfRange = price < Number(lower) || price > Number(upper)
    }
  }

  await publishAgentEvent({
    userId: ctx.userId,
    missionId: ctx.missionId,
    step: "signal",
    message: outOfRange
      ? `LP range breach — price ${event.price} outside band`
      : `LP watch tick — pool ${event.pool || "n/a"} in range`,
    payload: {
      tickLower: lower,
      tickUpper: upper,
      bandLow,
      bandHigh,
      outOfRange,
      event,
    },
  })

  await patchCanvasForUser({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    patch: {
      op: "set",
      widgetId: "inflight_trade",
      data: {
        status: outOfRange ? "lp_rebalance" : "lp_watch",
        pool: event.pool,
        tickLower: lower,
        tickUpper: upper,
        price: event.price,
      },
    },
  })

  if (!outOfRange) {
    return { acted: true, message: "lp_in_range" }
  }

  const { tokenIn, tokenOut, amountIn, chainId = 1, slippageBps = 50 } =
    ctx.params
  if (tokenIn && tokenOut && amountIn) {
    return quoteAndMaybeExecute({
      ctx,
      kind: "range_lp_rebalance",
      category: "range_lp",
      chainId,
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
    })
  }

  const lpBody = ctx.params.lpCreateBody
  if (lpBody && typeof lpBody === "object" && ctx.agentMode === "autonomous") {
    try {
      const blocked = await assertExecutionGuardrails({
        userId: ctx.userId,
        guardrails: ctx.guardrails,
        params: ctx.params,
        chainId,
      })
      if (blocked) return { acted: false, message: blocked }

      await publishAgentEvent({
        userId: ctx.userId,
        missionId: ctx.missionId,
        step: "quoting",
        message: "LP create / rebalance via Liquidity API",
      })
      const result = await liquidityClient.create(
        lpBody as Record<string, unknown>,
        "autonomous"
      )
      await publishAgentEvent({
        userId: ctx.userId,
        missionId: ctx.missionId,
        step: "status",
        message: "LP create response received — confirm/broadcast if calldata present",
        payload: { result },
      })
      return { acted: true, message: "lp_create_prepared" }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await publishAgentEvent({
        userId: ctx.userId,
        missionId: ctx.missionId,
        step: "failed",
        message,
      })
      return { acted: false, message }
    }
  }

  return { acted: true, message: "lp_out_of_range_no_rebalance_params" }
}

/**
 * Arb scan: if live price diverges from refPrice by >= minEdgeBps, execute arb swap.
 */
async function runArbScan(
  ctx: StrategyContext,
  event: MarketEvent
): Promise<StrategyResult> {
  const live = Number(event.price || 0)
  const ref = Number(
    ctx.params.refPrice ?? ctx.params.priceThreshold ?? 0
  )
  let edgeBps = 0
  if (Number.isFinite(live) && live > 0 && Number.isFinite(ref) && ref > 0) {
    edgeBps = Math.abs((live - ref) / ref) * 10_000
  }

  const hasEdge = edgeBps >= ctx.minEdgeBps

  await publishAgentEvent({
    userId: ctx.userId,
    missionId: ctx.missionId,
    step: "deciding",
    message: hasEdge
      ? `Arb edge ${edgeBps.toFixed(1)} bps ≥ ${ctx.minEdgeBps} — preparing swap`
      : `Arb scan: no edge on ${event.pool || "pool"} (edge=${edgeBps.toFixed(1)} bps)`,
    payload: { event, minEdgeBps: ctx.minEdgeBps, edgeBps, ref, live },
  })

  await patchCanvasForUser({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    patch: {
      op: "set",
      widgetId: "trade_tape",
      path: `arb.${Date.now()}`,
      data: {
        status: hasEdge ? "edge" : "scan",
        pool: event.pool,
        price: event.price,
        edgeBps,
        minEdgeBps: ctx.minEdgeBps,
      },
    },
  })

  if (!hasEdge) {
    return { acted: true, message: "arb_no_edge" }
  }

  const { tokenIn, tokenOut, amountIn, chainId = 1, slippageBps = 50 } =
    ctx.params
  if (!tokenIn || !tokenOut || !amountIn) {
    return {
      acted: true,
      message: "arb_edge_missing_swap_params",
    }
  }

  return quoteAndMaybeExecute({
    ctx,
    kind: "arb_scan",
    category: "arb",
    chainId,
    tokenIn,
    tokenOut,
    amountIn,
    slippageBps,
  })
}
