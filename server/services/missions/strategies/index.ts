import type { MarketEvent } from "@/server/services/market/bus"
import type { MissionParams, MissionStrategy } from "../types"
import { publishAgentEvent } from "@/server/services/market/bus"
import { patchCanvasForUser } from "@/server/services/canvas/store"
import { tradeClient } from "@/server/services/uniswap/trade.client"
import { executePreparedTx } from "@/server/services/wallet/executor"
import type { AgentMode } from "@/lib/types"

export type StrategyContext = {
  missionId: string
  userId: string
  conversationId?: string | null
  strategy: MissionStrategy
  params: MissionParams
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
  ctx: StrategyContext,
  event: MarketEvent
): Promise<StrategyResult> {
  await publishAgentEvent({
    userId: ctx.userId,
    missionId: ctx.missionId,
    step: "signal",
    message: `Market tick ${event.symbol0 || ""}/${event.symbol1 || ""} ${event.price || ""}`,
    payload: event as unknown as Record<string, unknown>,
  })
  await patchCanvasForUser({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    patch: {
      op: "set",
      widgetId: "pool_table",
      path: "lastTick",
      data: event,
    },
  })
  return { acted: true, message: "watched" }
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

  await publishAgentEvent({
    userId: ctx.userId,
    missionId: ctx.missionId,
    step: "quoting",
    message: `Quoting ${amountIn} ${tokenIn.slice(0, 8)}→${tokenOut.slice(0, 8)}`,
  })

  await patchCanvasForUser({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    patch: {
      op: "replace",
      widgetId: "inflight_trade",
      kind: "inflight_trade",
      data: { status: "quoting", tokenIn, tokenOut, amountIn },
    },
  })

  try {
    const quoteBody = {
      type: "EXACT_INPUT",
      amount: amountIn,
      tokenInChainId: chainId,
      tokenOutChainId: chainId,
      tokenIn,
      tokenOut,
      swapper: undefined as string | undefined,
      slippageTolerance: slippageBps / 100,
    }
    const quote = (await tradeClient.quote(quoteBody, "autonomous")) as Record<
      string,
      unknown
    >

    await publishAgentEvent({
      userId: ctx.userId,
      missionId: ctx.missionId,
      step: "deciding",
      message: `Quote routing=${String(quote.routing || "")}`,
      payload: { routing: quote.routing },
    })

    if (ctx.agentMode !== "autonomous") {
      await publishAgentEvent({
        userId: ctx.userId,
        missionId: ctx.missionId,
        step: "status",
        message: "Quote ready — enable autonomous or confirm to execute",
        payload: { quote },
      })
      return { acted: true, message: "quoted_awaiting_confirm" }
    }

    const prepared = await tradeClient.prepareExecution({
      quote,
      decisionOrigin: "autonomous",
    })
    const resultPayload = prepared.result as Record<string, unknown>
    const swap = (resultPayload.swap || resultPayload) as Record<string, unknown>
    const result = await executePreparedTx({
      userId: ctx.userId,
      agentMode: ctx.agentMode,
      requireAutonomous: true,
      prepared: {
        chainId,
        to: String(swap.to || ""),
        data: String(swap.data || ""),
        value: swap.value != null ? String(swap.value) : "0x0",
        category: "swap_dca",
        responsePayload: resultPayload,
        requestPayload: quoteBody,
        missionId: ctx.missionId,
        conversationId: ctx.conversationId,
      },
    })

    return {
      acted: result.ok,
      message: result.ok ? `submitted ${result.txHash}` : result.error || "failed",
    }
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

async function runRangeLp(
  ctx: StrategyContext,
  event: MarketEvent
): Promise<StrategyResult> {
  await publishAgentEvent({
    userId: ctx.userId,
    missionId: ctx.missionId,
    step: "signal",
    message: `LP watch tick — pool ${event.pool || "n/a"}`,
    payload: {
      tickLower: ctx.params.tickLower,
      tickUpper: ctx.params.tickUpper,
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
        status: "lp_watch",
        pool: event.pool,
        tickLower: ctx.params.tickLower,
        tickUpper: ctx.params.tickUpper,
      },
    },
  })
  return { acted: true, message: "lp_signal_logged" }
}

async function runArbScan(
  ctx: StrategyContext,
  event: MarketEvent
): Promise<StrategyResult> {
  const edgeBps = Number(event.price || 0) > 0 ? ctx.minEdgeBps : 0
  await publishAgentEvent({
    userId: ctx.userId,
    missionId: ctx.missionId,
    step: "deciding",
    message:
      edgeBps >= ctx.minEdgeBps
        ? `Arb scan: candidate edge ≥ ${ctx.minEdgeBps} bps (confirm to execute)`
        : `Arb scan: no edge on ${event.pool || "pool"}`,
    payload: { event, minEdgeBps: ctx.minEdgeBps },
  })
  await patchCanvasForUser({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    patch: {
      op: "set",
      widgetId: "trade_tape",
      path: `arb.${Date.now()}`,
      data: {
        status: "scan",
        pool: event.pool,
        price: event.price,
        minEdgeBps: ctx.minEdgeBps,
      },
    },
  })
  return { acted: true, message: "arb_scanned" }
}
