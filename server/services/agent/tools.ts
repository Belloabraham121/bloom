import { z } from "zod"
import type { AgentMode } from "@/lib/types"
import { liquidityClient, tradeClient } from "@/server/services/uniswap/trade.client"
import { insertTransaction } from "@/server/services/uniswap/transactions.repo"
import {
  getPoolTelemetry,
  getTokensInPools,
  getTopPools,
  listSubgraphMarkets,
  runSubgraphQuery,
  type UniswapVersion,
} from "@/server/services/subgraph/client"
import { resolveExecutionPath } from "@/server/services/uniswap/routing"
import {
  attachTokenLogos,
  normalizeTradingApiTokens,
} from "@/server/services/uniswap/token-logos"
import {
  formatBalanceDisplay,
  getWalletBalance,
  getWalletBalancesAll,
} from "@/server/services/wallet/balance"
import { db } from "@/server/services/db/client"
import { wallets } from "@/server/services/db/schema"
import { eq } from "drizzle-orm"

export type ToolContext = {
  userId: string
  decisionOrigin: AgentMode
  conversationId?: string | null
}

export type TradingToolHandler = {
  description: string
  parameters: z.ZodType
  execute: (args: unknown) => Promise<unknown>
}

function origin(ctx: ToolContext) {
  return ctx.decisionOrigin
}

function asObject(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  return {}
}

/**
 * Plain tool handlers for the OpenAI SDK ↔ Thesys Chat Completions loop.
 */
export function createTradingToolHandlers(
  ctx: ToolContext
): Record<string, TradingToolHandler> {
  return {
    check_approval: {
      description: "Check ERC20 / Permit2 approvals needed before a swap",
      parameters: z.object({
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return tradeClient.checkApproval(body, origin(ctx))
      },
    },

    get_quote: {
      description:
        "Get a Uniswap quote AND paint it on CanvasSlot(\"quote\") with QuoteSummary + ConfirmTx. Pass body: {tokenIn, tokenOut, amount, tokenInChainId?, tokenOutChainId?}. Symbols OK (USDC/WETH/ETH). Do NOT emit a new root Stack — this tool updates the board.",
      parameters: z.object({
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { body: raw } = asObject(args) as {
          body: Record<string, unknown>
        }
        const { normalizeQuoteBody } = await import(
          "@/server/services/uniswap/normalize-quote"
        )
        const { patchCanvasForUser } = await import(
          "@/server/services/canvas/store"
        )
        const {
          buildPreparedJsonFromSwapResult,
          buildQuoteSlotOpenui,
          estimateAmountOutDisplay,
          humanAmountFromBase,
        } = await import("@/server/services/canvas/quote-openui")

        let swapper: string | null = null
        try {
          const rows = await db
            .select()
            .from(wallets)
            .where(eq(wallets.userId, ctx.userId))
            .limit(1)
          const addr = rows[0]?.address
          if (typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
            swapper = addr
          }
        } catch {
          /* optional */
        }
        const { body, warnings } = await normalizeQuoteBody(raw, {
          decisionOrigin: origin(ctx),
          swapper,
        })
        try {
          const quote = (await tradeClient.quote(body, origin(ctx))) as Record<
            string,
            unknown
          >
          const routing = String(quote.routing ?? "")
          const suggestedPath = resolveExecutionPath(routing)

          let preparedJson: string | null = null
          let prepareError: string | undefined
          if (suggestedPath === "swap" || suggestedPath === "swap_5792" || suggestedPath === "swap_7702") {
            try {
              const prepared = await tradeClient.prepareExecution({
                quote,
                preferBatch: null,
                decisionOrigin: origin(ctx),
              })
              await insertTransaction({
                userId: ctx.userId,
                conversationId: ctx.conversationId,
                category: "swap",
                status: "pending",
                responsePayload: prepared.result,
                requestPayload: quote,
              })
              preparedJson = buildPreparedJsonFromSwapResult(
                prepared.result,
                Number(body.tokenInChainId) || 1
              )
            } catch (e) {
              prepareError =
                e instanceof Error ? e.message : "prepareExecution failed"
            }
          }

          const symbolIn = String(
            raw.tokenIn || raw.symbolIn || "TOKEN_IN"
          ).toUpperCase()
          const symbolOut = String(
            raw.tokenOut || raw.symbolOut || "TOKEN_OUT"
          ).toUpperCase()
          const decimalsIn =
            symbolIn === "USDC" || symbolIn === "USDT" ? 6 : 18
          const amountInHuman = humanAmountFromBase(
            String(body.amount),
            decimalsIn
          )
          const amountOutDisplay = estimateAmountOutDisplay(
            quote,
            symbolOut === "USDC" || symbolOut === "USDT" ? 6 : 18
          )
          const summary = `Swap ${amountInHuman} ${symbolIn} for ~${amountOutDisplay} ${symbolOut}`
          const openui = buildQuoteSlotOpenui({
            symbolIn: /^0X/.test(symbolIn) ? "Token" : symbolIn,
            symbolOut: /^0X/.test(symbolOut) ? "Token" : symbolOut,
            amountInHuman,
            amountOutDisplay,
            routing: routing || "CLASSIC",
            chainName: Number(body.tokenInChainId) === 8453 ? "Base" : "Ethereum",
            preparedJson,
            summary,
          })

          await patchCanvasForUser({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            patch: {
              op: "replace",
              widgetId: "quote",
              kind: "openui",
              data: { openui },
            },
          })

          return {
            ok: true,
            quote,
            suggestedPath,
            request: body,
            preparedJson,
            canvasPatched: "quote",
            needsConfirm: Boolean(preparedJson),
            prepareError,
            warnings: warnings.length ? warnings : undefined,
            openuiHint:
              "Quote panel updated on canvas. Reply with short plain text only — do not emit root=Stack.",
          }
        } catch (err) {
          const { UniswapApiError } = await import(
            "@/server/services/uniswap/http"
          )
          if (err instanceof UniswapApiError) {
            return {
              error: err.message,
              status: err.status,
              requestId: err.requestId,
              detail: err.body,
              request: body,
              warnings,
            }
          }
          throw err
        }
      },
    },

    create_swap_calldata: {
      description:
        "Create classic/bridge/wrap swap calldata from a quote via POST /swap. Returns preparedJson for ConfirmTx. Prefer get_quote which already prepares + patches the quote panel.",
      parameters: z.object({
        quote: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { quote } = asObject(args) as { quote: Record<string, unknown> }
        const prepared = await tradeClient.prepareExecution({
          quote,
          preferBatch: null,
          decisionOrigin: origin(ctx),
        })
        await insertTransaction({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          category: prepared.path === "order" ? "gasless_order" : "swap",
          status: "pending",
          responsePayload: prepared.result,
          requestPayload: quote,
        })
        const { buildPreparedJsonFromSwapResult } = await import(
          "@/server/services/canvas/quote-openui"
        )
        const chainId =
          typeof (quote as { chainId?: number }).chainId === "number"
            ? (quote as { chainId: number }).chainId
            : 1
        const preparedJson = buildPreparedJsonFromSwapResult(
          prepared.result,
          chainId
        )
        return {
          ...prepared,
          preparedJson,
          openuiHint: preparedJson
            ? `Patch quote slot ConfirmTx preparedJson=${preparedJson.slice(0, 80)}…`
            : "No broadcastable calldata in prepare result",
        }
      },
    },

    create_gasless_order: {
      description: "Submit a UniswapX gasless order after a DUTCH_*/PRIORITY quote",
      parameters: z.object({
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        const result = await tradeClient.order(body, origin(ctx))
        await insertTransaction({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          category: "gasless_order",
          status: "submitted",
          requestPayload: body,
          responsePayload: result,
        })
        return result
      },
    },

    get_gasless_order_status: {
      description: "Poll UniswapX order status via GET /orders",
      parameters: z.object({
        swapper: z.string().optional(),
        orderHash: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args)
        return tradeClient.getOrders(
          {
            swapper: typeof q.swapper === "string" ? q.swapper : undefined,
            orderHash: typeof q.orderHash === "string" ? q.orderHash : undefined,
            limit: typeof q.limit === "number" ? q.limit : undefined,
          },
          origin(ctx)
        )
      },
    },

    get_swap_status: {
      description: "Poll swap status via GET /swaps",
      parameters: z.object({
        requestId: z.string().optional(),
        txHash: z.string().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args)
        return tradeClient.getSwaps(
          {
            requestId: typeof q.requestId === "string" ? q.requestId : undefined,
            txHash: typeof q.txHash === "string" ? q.txHash : undefined,
          },
          origin(ctx)
        )
      },
    },

    create_swap_5792: {
      description: "Create EIP-5792 atomic batch swap calldata",
      parameters: z.object({
        quote: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { quote } = asObject(args) as { quote: Record<string, unknown> }
        const prepared = await tradeClient.prepareExecution({
          quote,
          preferBatch: "swap_5792",
          decisionOrigin: origin(ctx),
        })
        await insertTransaction({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          category: "batch_5792",
          status: "pending",
          requestPayload: quote,
          responsePayload: prepared.result,
        })
        return prepared
      },
    },

    create_swap_7702: {
      description: "Create EIP-7702 batch swap calldata",
      parameters: z.object({
        quote: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { quote } = asObject(args) as { quote: Record<string, unknown> }
        const prepared = await tradeClient.prepareExecution({
          quote,
          preferBatch: "swap_7702",
          decisionOrigin: origin(ctx),
        })
        await insertTransaction({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          category: "batch_7702",
          status: "pending",
          requestPayload: quote,
          responsePayload: prepared.result,
        })
        return prepared
      },
    },

    encode_wallet_7702: {
      description: "Encode wallet transactions for EIP-7702",
      parameters: z.object({
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return tradeClient.encode7702(body, origin(ctx))
      },
    },

    check_wallet_delegation: {
      description: "Check whether the wallet has EIP-7702 delegation",
      parameters: z.object({
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return tradeClient.checkDelegation(body, origin(ctx))
      },
    },

    create_execution_plan: {
      description: "Create a chained execution plan when quote routing is CHAINED",
      parameters: z.object({
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        const result = await tradeClient.createPlan(body, origin(ctx))
        await insertTransaction({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          category: "chained_step",
          status: "pending",
          requestPayload: body,
          responsePayload: result,
          uniswapPlanId:
            result && typeof result === "object" && "planId" in result
              ? String((result as { planId: unknown }).planId)
              : null,
        })
        return result
      },
    },

    get_execution_plan: {
      description: "Get chained plan status",
      parameters: z.object({
        planId: z.string(),
        forceRefresh: z.boolean().optional(),
      }),
      execute: async (args) => {
        const { planId, forceRefresh } = asObject(args) as {
          planId: string
          forceRefresh?: boolean
        }
        return tradeClient.getPlan(planId, { forceRefresh }, origin(ctx))
      },
    },

    update_execution_plan: {
      description: "Patch a chained execution plan (submit step results)",
      parameters: z.object({
        planId: z.string(),
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { planId, body } = asObject(args) as {
          planId: string
          body: Record<string, unknown>
        }
        return tradeClient.updatePlan(planId, body, origin(ctx))
      },
    },

    lp_check_approval: {
      description: "Check LP token approvals",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return liquidityClient.checkApproval(body, origin(ctx))
      },
    },

    lp_create: {
      description: "Create a Uniswap V3 or V4 LP position",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        const result = await liquidityClient.create(body, origin(ctx))
        await insertTransaction({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          category: "lp",
          provider: "uniswap_lp",
          status: "pending",
          requestPayload: body,
          responsePayload: result,
        })
        return result
      },
    },

    lp_increase: {
      description: "Increase an LP position",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return liquidityClient.increase(body, origin(ctx))
      },
    },

    lp_decrease: {
      description: "Decrease an LP position",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return liquidityClient.decrease(body, origin(ctx))
      },
    },

    lp_claim_fees: {
      description: "Claim LP position fees",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return liquidityClient.claimFees(body, origin(ctx))
      },
    },

    lp_create_classic: {
      description: "Create a classic Uniswap V2 LP position",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return liquidityClient.createClassic(body, origin(ctx))
      },
    },

    lp_pool_info: {
      description: "Get LP pool state from Uniswap Liquidity API",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return liquidityClient.poolInfo(body, origin(ctx))
      },
    },

    check_token_permissions: {
      description: "Check token KYC / permissioned pool access",
      parameters: z.object({ body: z.record(z.string(), z.unknown()) }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        return tradeClient.permissions(body, origin(ctx))
      },
    },

    get_wallet_balance: {
      description:
        "Get the signed-in user's wallet native + USDC balances for a chain (default Ethereum). Use when the user asks about their balance.",
      parameters: z.object({
        chainId: z.number().optional(),
        address: z.string().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as { chainId?: number; address?: string }
        let address = q.address?.trim()
        if (!address) {
          const wallet = await db.query.wallets.findFirst({
            where: eq(wallets.userId, ctx.userId),
          })
          address = wallet?.address
        }
        if (!address) {
          return { error: "No wallet linked to this account yet." }
        }
        const balance = await getWalletBalance({
          address,
          chainId: q.chainId ?? 1,
        })
        return {
          ...balance,
          nativeDisplay: `${formatBalanceDisplay(balance.native.formatted)} ${balance.native.symbol}`,
          usdcDisplay: balance.usdc
            ? `${formatBalanceDisplay(balance.usdc.formatted, 2)} USDC`
            : null,
        }
      },
    },

    get_wallet_balances: {
      description:
        "Get native + USDC balances on all supported EVM chains (Ethereum, Optimism, Polygon, Base, Arbitrum). Emit BalanceBoard with rowsJson from the result.",
      parameters: z.object({
        address: z.string().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as { address?: string }
        let address = q.address?.trim()
        if (!address) {
          const wallet = await db.query.wallets.findFirst({
            where: eq(wallets.userId, ctx.userId),
          })
          address = wallet?.address
        }
        if (!address) {
          return { error: "No wallet linked to this account yet." }
        }
        const rows = await getWalletBalancesAll(address)
        const boardRows = rows.map((r) => {
          if ("error" in r) {
            return {
              chainId: r.chainId,
              error: r.error,
            }
          }
          return {
            chainId: r.chainId,
            chainName: r.chainName,
            native: `${formatBalanceDisplay(r.native.formatted)} ${r.native.symbol}`,
            usdc: r.usdc
              ? `${formatBalanceDisplay(r.usdc.formatted, 2)} USDC`
              : null,
          }
        })
        return {
          address,
          rows: boardRows,
          rowsJson: JSON.stringify(boardRows),
          openuiHint:
            'Emit BalanceBoard("Balances", rowsJson) with the rowsJson string from this result.',
        }
      },
    },

    prepare_transfer: {
      description:
        "Prepare a native or USDC transfer to an address. Returns prepared tx + needsConfirm. Emit ConfirmSend/ConfirmTx with preparedJson, then execute_prepared_tx with confirmed=true (or user clicks Confirm).",
      parameters: z.object({
        chainId: z.number(),
        to: z.string(),
        amount: z.string(),
        token: z.enum(["native", "usdc"]).optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as {
          chainId: number
          to: string
          amount: string
          token?: "native" | "usdc"
        }
        const { prepareTransfer } = await import(
          "@/server/services/wallet/transfer"
        )
        const { insertTradeIntent } = await import(
          "@/server/services/uniswap/intents.repo"
        )
        const prepared = prepareTransfer({
          chainId: q.chainId,
          to: q.to,
          amount: q.amount,
          token: q.token,
        })
        const intent = await insertTradeIntent({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          kind: "transfer",
          status: "proposed",
          chainIdIn: q.chainId,
          chainIdOut: q.chainId,
          tokenIn: prepared.token,
          tokenOut: q.to,
          amountIn: q.amount,
          calldataPayload: prepared,
        })
        const preparedJson = JSON.stringify({
          chainId: prepared.chainId,
          to: prepared.to,
          data: prepared.data,
          value: prepared.value,
          category: prepared.category,
          tradeIntentId: intent.id,
        })
        return {
          needsConfirm: true,
          intentId: intent.id,
          prepared,
          preparedJson,
          openuiHint: `Emit ConfirmSend or ConfirmTx with preparedJson=${JSON.stringify(preparedJson)} summarizing send ${q.amount} ${q.token || "native"} to ${q.to} on chain ${q.chainId}.`,
        }
      },
    },

    get_bridgable_tokens: {
      description:
        "List bridgable / swappable tokens (logoUrl from Uniswap, filled via CoinGecko when missing)",
      parameters: z.object({
        chainId: z.number().optional(),
      }),
      execute: async (args) => {
        const { chainId } = asObject(args) as { chainId?: number }
        const data = await tradeClient.swappableTokens(
          chainId ? { chainId } : undefined,
          origin(ctx)
        )
        return normalizeTradingApiTokens(data, chainId)
      },
    },

    get_supported_chains: {
      description: "List Uniswap Trading API supported chains",
      parameters: z.object({}),
      execute: async () => tradeClient.supportedChains(origin(ctx)),
    },

    get_tokens: {
      description:
        "Search or list tokens from Uniswap Trading API (logoUrl from Uniswap + CoinGecko fill)",
      parameters: z.object({
        chainId: z.number().optional(),
        search: z.string().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args)
        const chainId = typeof q.chainId === "number" ? q.chainId : undefined
        const data = await tradeClient.tokens(
          {
            chainId,
            search: typeof q.search === "string" ? q.search : undefined,
          },
          origin(ctx)
        )
        return normalizeTradingApiTokens(data, chainId)
      },
    },

    list_subgraph_markets: {
      description:
        "List live Uniswap V2/V3/V4 The Graph markets (version+chainId+subgraphId). Call when the user asks which chains/versions are available. Not stored in Bloom DB.",
      parameters: z.object({}),
      execute: async () => listSubgraphMarkets(),
    },

    get_top_pools: {
      description:
        "Live top Uniswap pools/pairs by TVL from The Graph. Pass version (v2|v3|v4) and chainId (e.g. 8453 Base, 42161 Arbitrum, 130 Unichain). Defaults v3/1.",
      parameters: z.object({
        version: z.enum(["v2", "v3", "v4"]).optional(),
        chainId: z.number().optional(),
        first: z.number().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as {
          version?: UniswapVersion
          chainId?: number
          first?: number
        }
        return getTopPools(q)
      },
    },

    get_tokens_in_pools: {
      description:
        "Live tokens in top Uniswap pools (The Graph) with logoUrl from Uniswap, filled via CoinGecko when missing. Pass version + chainId.",
      parameters: z.object({
        version: z.enum(["v2", "v3", "v4"]).optional(),
        chainId: z.number().optional(),
        first: z.number().optional(),
        search: z.string().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as {
          version?: UniswapVersion
          chainId?: number
          first?: number
          search?: string
        }
        const result = await getTokensInPools(q)
        const tokens = await attachTokenLogos(
          result.chainId,
          result.tokens,
          origin(ctx)
        )
        return { ...result, tokens }
      },
    },

    get_pool_telemetry: {
      description:
        "Fetch Uniswap pool/pair TVL and volume from The Graph for a token pair. Pass version (v2|v3|v4) and chainId for the target market.",
      parameters: z.object({
        version: z.enum(["v2", "v3", "v4"]).optional(),
        chainId: z.number().optional(),
        token0: z.string(),
        token1: z.string(),
      }),
      execute: async (args) => {
        const { version, chainId, token0, token1 } = asObject(args) as {
          version?: UniswapVersion
          chainId?: number
          token0: string
          token1: string
        }
        return getPoolTelemetry({ version, chainId, token0, token1 })
      },
    },

    run_subgraph_query: {
      description:
        "Raw GraphQL against a Uniswap V2/V3/V4 subgraph. Prefer get_pool_telemetry / get_top_pools / get_tokens_in_pools when possible.",
      parameters: z.object({
        version: z.enum(["v2", "v3", "v4"]),
        chainId: z.number(),
        query: z.string(),
        variables: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as {
          version: UniswapVersion
          chainId: number
          query: string
          variables?: Record<string, unknown>
        }
        return runSubgraphQuery(q)
      },
    },

    patch_canvas: {
      description:
        "Edit the living canvas. (1) First paint only: op=full + openuiDocument with Stack([CanvasWorld([...])]) and CanvasSlot(id, x, y). (2) Edit a panel: op=replace|set widgetId=<slotId> kind=openui data={openui:\"...\"}. (3) New dashboard when user asks: op=add_dashboard widgetId=<newId> data={openui:\"...\"} (auto x/y grid). (4) op=remove clears a slot. After a shell exists: NEVER re-emit root=Stack in chat — only patch_canvas + short text.",
      parameters: z.object({
        op: z.enum([
          "set",
          "replace",
          "insert",
          "remove",
          "full",
          "add_dashboard",
          "move",
        ]),
        widgetId: z.string().optional(),
        path: z.string().optional(),
        kind: z
          .enum([
            "header",
            "pool_table",
            "volume_chart",
            "wallet_balance",
            "inflight_trade",
            "trade_tape",
            "openui",
            "custom",
          ])
          .optional(),
        openuiDocument: z.string().optional(),
        data: z.unknown().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
      }),
      execute: async (args) => {
        const patch = asObject(args) as {
          op:
            | "set"
            | "replace"
            | "insert"
            | "remove"
            | "full"
            | "add_dashboard"
            | "move"
          widgetId?: string
          path?: string
          kind?: import("@/server/services/canvas/model").WidgetKind
          openuiDocument?: string
          data?: unknown
          x?: number
          y?: number
        }
        // Default OpenUI slot patches to kind=openui when updating a named slot
        if (
          (patch.op === "replace" ||
            patch.op === "set" ||
            patch.op === "insert" ||
            patch.op === "add_dashboard") &&
          patch.widgetId &&
          !patch.kind &&
          (typeof patch.data === "string" ||
            (patch.data &&
              typeof patch.data === "object" &&
              ("openui" in (patch.data as object) ||
                "fragment" in (patch.data as object))) ||
            patch.op === "add_dashboard")
        ) {
          patch.kind = "openui"
        }
        const { patchCanvasForUser } = await import(
          "@/server/services/canvas/store"
        )
        const canvas = await patchCanvasForUser({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          patch,
        })
        return {
          ok: true,
          revision: canvas.revision,
          layout: canvas.layout,
          slots: Object.keys(canvas.widgets).filter((id) => id !== "_live"),
          hasShell: Boolean(canvas.openuiDocument),
          openuiDocument: canvas.openuiDocument ?? null,
        }
      },
    },

    create_mission: {
      description:
        "Create a mission: watch | swap_dca | range_lp | arb_scan. Does not start until start_mission.",
      parameters: z.object({
        strategy: z.enum(["watch", "swap_dca", "range_lp", "arb_scan"]),
        params: z.record(z.string(), z.unknown()).optional(),
        guardrails: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as {
          strategy: "watch" | "swap_dca" | "range_lp" | "arb_scan"
          params?: Record<string, unknown>
          guardrails?: Record<string, unknown>
        }
        const { createMission } = await import(
          "@/server/services/missions/repo"
        )
        const mission = await createMission({
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          strategy: q.strategy,
          params: q.params,
          guardrails: q.guardrails,
        })
        return { mission }
      },
    },

    start_mission: {
      description: "Start a draft/paused mission so the agent works in the background",
      parameters: z.object({ missionId: z.string() }),
      execute: async (args) => {
        const { missionId } = asObject(args) as { missionId: string }
        const { updateMission, getMission } = await import(
          "@/server/services/missions/repo"
        )
        const { kickMission } = await import(
          "@/server/services/missions/runner"
        )
        const { ensureLiveIngest } = await import(
          "@/server/services/market/ingest"
        )
        const { startLiveSession } = await import(
          "@/server/services/market/live-session"
        )
        const existing = await getMission(missionId, ctx.userId)
        const chainId =
          typeof (existing?.params as { chainId?: number } | null)?.chainId ===
          "number"
            ? (existing!.params as { chainId: number }).chainId
            : 1
        ensureLiveIngest({ chainId })
        await startLiveSession({
          userId: ctx.userId,
          conversationId: ctx.conversationId ?? null,
          chainId,
          purpose: String(existing?.strategy || "mission"),
          missionId,
          startedAt: new Date().toISOString(),
        })
        const mission = await updateMission(missionId, ctx.userId, {
          status: "running",
          lastError: null,
          lastActivityAt: new Date(),
        })
        await kickMission(missionId, ctx.userId)
        return {
          mission,
          liveActive: true,
          openuiHint:
            "Emit OpenUI Stack including LiveActivity, LiveMarketTick, LiveTradeTape, and/or InflightTrade — do not rely on fixed chrome.",
        }
      },
    },

    pause_mission: {
      description: "Pause a running mission",
      parameters: z.object({ missionId: z.string() }),
      execute: async (args) => {
        const { missionId } = asObject(args) as { missionId: string }
        const { updateMission } = await import(
          "@/server/services/missions/repo"
        )
        return {
          mission: await updateMission(missionId, ctx.userId, {
            status: "paused",
          }),
        }
      },
    },

    stop_mission: {
      description: "Stop a mission and end the live real-time session UI",
      parameters: z.object({ missionId: z.string() }),
      execute: async (args) => {
        const { missionId } = asObject(args) as { missionId: string }
        const { updateMission } = await import(
          "@/server/services/missions/repo"
        )
        const { stopLiveSession } = await import(
          "@/server/services/market/live-session"
        )
        const mission = await updateMission(missionId, ctx.userId, {
          status: "stopped",
        })
        await stopLiveSession(ctx.userId)
        return { mission, liveActive: false }
      },
    },

    start_market_watch: {
      description:
        "ONLY when the user asks for real-time / live market data. Starts live SSE and seeds CanvasSlot(\"live\") with Live* panels. Do not emit a new root Stack afterward — reply with short text.",
      parameters: z.object({
        chainId: z.number().optional(),
        purpose: z.string().optional(),
        symbol0: z.string().optional(),
        symbol1: z.string().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as {
          chainId?: number
          purpose?: string
          symbol0?: string
          symbol1?: string
        }
        const chainId = q.chainId ?? 1
        const sanitize = (raw: string | undefined, fallback: string) => {
          const s = (raw || fallback).trim().toUpperCase()
          // Typos like "8" or single digits are not tickers
          if (!s || /^\d+$/.test(s) || s.length < 2) return fallback
          if (s === "ETHER" || s === "ETHEREUM") return "ETH"
          return s
        }
        const symbol0 = sanitize(q.symbol0, "USDC")
        const symbol1 = sanitize(q.symbol1, "ETH")
        const { ensureLiveIngest } = await import(
          "@/server/services/market/ingest"
        )
        const { startLiveSession } = await import(
          "@/server/services/market/live-session"
        )
        const { publishAgentEvent } = await import(
          "@/server/services/market/bus"
        )
        const { createMission, updateMission } = await import(
          "@/server/services/missions/repo"
        )
        const { kickMission } = await import(
          "@/server/services/missions/runner"
        )
        const { patchCanvasForUser } = await import(
          "@/server/services/canvas/store"
        )

        let missionId: string | null = null
        const errors: string[] = []

        try {
          ensureLiveIngest({
            chainId,
            symbol0,
            symbol1,
            userId: ctx.userId,
          })
        } catch (e) {
          errors.push(`ingest: ${e instanceof Error ? e.message : String(e)}`)
        }

        try {
          const mission = await createMission({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            strategy: "watch",
            params: {
              chainId,
              symbol0,
              symbol1,
            },
            status: "draft",
          })
          await updateMission(mission.id, ctx.userId, {
            status: "running",
            lastActivityAt: new Date(),
          })
          missionId = mission.id
        } catch (e) {
          errors.push(`mission: ${e instanceof Error ? e.message : String(e)}`)
        }

        await startLiveSession({
          userId: ctx.userId,
          conversationId: ctx.conversationId ?? null,
          chainId,
          purpose: q.purpose || "market_watch",
          missionId,
          symbol0,
          symbol1,
          paused: false,
          startedAt: new Date().toISOString(),
        })

        // Client flips liveActive from this canvas patch (always-on SSE) — avoids Redis chicken/egg
        try {
          await patchCanvasForUser({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            patch: {
              op: "replace",
              widgetId: "_live",
              kind: "custom",
              data: {
                active: true,
                paused: false,
                chainId,
                missionId,
                purpose: q.purpose || "market_watch",
                symbol0,
                symbol1,
              },
            },
          })
          // Fill CanvasSlot("live") so the desk is not idle if the model only emits a shell
          const { DEFAULT_LIVE_SLOT_OPENUI, isOpenuiSlotEmpty } = await import(
            "@/server/services/canvas/model"
          )
          const { getCanvasModel } = await import(
            "@/server/services/canvas/store"
          )
          const canvasNow = await getCanvasModel(
            ctx.userId,
            ctx.conversationId ?? null
          )
          if (isOpenuiSlotEmpty(canvasNow, "live")) {
            await patchCanvasForUser({
              userId: ctx.userId,
              conversationId: ctx.conversationId,
              patch: {
                op: "replace",
                widgetId: "live",
                kind: "openui",
                data: { openui: DEFAULT_LIVE_SLOT_OPENUI },
              },
            })
          }
        } catch (e) {
          errors.push(`canvas: ${e instanceof Error ? e.message : String(e)}`)
        }

        if (missionId) {
          try {
            await kickMission(missionId, ctx.userId)
          } catch (e) {
            errors.push(`kick: ${e instanceof Error ? e.message : String(e)}`)
          }
        }

        try {
          await publishAgentEvent({
            userId: ctx.userId,
            missionId: missionId ?? undefined,
            step: "status",
            message: q.purpose
              ? `Live watch started — ${q.purpose}`
              : "Live market watch started",
          })
        } catch (e) {
          errors.push(`event: ${e instanceof Error ? e.message : String(e)}`)
        }

        return {
          liveActive: true,
          missionId,
          chainId,
          symbol0,
          symbol1,
          warnings: errors.length ? errors : undefined,
          openuiHint:
            "Live slot auto-seeded with LiveActivity / LiveMarketTick / LiveTradeTape / LiveMarketSwitcher. Prefer shell Stack with CanvasSlot(live)+CanvasSlot(quote); do not leave live waiting. Pass symbol0=USDC symbol1=ETH.",
        }
      },
    },

    stop_market_watch: {
      description:
        "Stop real-time market watch / live SSE session. After this, omit Live* components from OpenUI or note that live is off.",
      parameters: z.object({}),
      execute: async () => {
        const { stopLiveSession } = await import(
          "@/server/services/market/live-session"
        )
        const { listMissionsForUser, updateMission } = await import(
          "@/server/services/missions/repo"
        )
        const { publishAgentEvent } = await import(
          "@/server/services/market/bus"
        )
        const { patchCanvasForUser } = await import(
          "@/server/services/canvas/store"
        )
        await stopLiveSession(ctx.userId)
        try {
          const missions = await listMissionsForUser(ctx.userId, 20)
          for (const m of missions) {
            if (m.status === "running" && m.strategy === "watch") {
              await updateMission(m.id, ctx.userId, { status: "stopped" })
            }
          }
        } catch {
          /* db optional for stop */
        }
        try {
          await patchCanvasForUser({
            userId: ctx.userId,
            conversationId: ctx.conversationId,
            patch: {
              op: "replace",
              widgetId: "_live",
              kind: "custom",
              data: { active: false },
            },
          })
        } catch {
          /* ignore */
        }
        try {
          await publishAgentEvent({
            userId: ctx.userId,
            step: "status",
            message: "Live market watch stopped",
          })
        } catch {
          /* ignore */
        }
        return { liveActive: false }
      },
    },

    get_mission_status: {
      description: "List missions or get one by id",
      parameters: z.object({ missionId: z.string().optional() }),
      execute: async (args) => {
        const { missionId } = asObject(args) as { missionId?: string }
        const { getMission, listMissionsForUser } = await import(
          "@/server/services/missions/repo"
        )
        if (missionId) {
          return { mission: await getMission(missionId, ctx.userId) }
        }
        return { missions: await listMissionsForUser(ctx.userId) }
      },
    },

    get_recent_market_events: {
      description: "Recent live market ticks from Substreams/poller bus",
      parameters: z.object({
        chainId: z.number().optional(),
        limit: z.number().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as { chainId?: number; limit?: number }
        const { getRecentMarketEvents } = await import(
          "@/server/services/market/bus"
        )
        return {
          events: await getRecentMarketEvents(q.chainId ?? 1, q.limit ?? 20),
        }
      },
    },

    execute_prepared_tx: {
      description:
        "Broadcast a prepared Uniswap/transfer tx via Privy. In human_mediated mode set confirmed=true only after the user clicked Confirm. In autonomous mode broadcasts when kill switch is off.",
      parameters: z.object({
        chainId: z.number(),
        to: z.string(),
        data: z.string().optional(),
        value: z.string().optional(),
        category: z.string().optional(),
        responsePayload: z.unknown().optional(),
        tradeIntentId: z.string().optional(),
        confirmed: z.boolean().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args) as {
          chainId: number
          to: string
          data?: string
          value?: string
          category?: string
          responsePayload?: unknown
          tradeIntentId?: string
          confirmed?: boolean
        }
        const isAuto = ctx.decisionOrigin === "autonomous"
        if (!isAuto && !q.confirmed) {
          return {
            ok: false,
            needsConfirm: true,
            error:
              "User confirmation required. Emit ConfirmTx with preparedJson, then call again with confirmed=true.",
            prepared: {
              chainId: q.chainId,
              to: q.to,
              data: q.data || "0x",
              value: q.value,
              category: q.category,
            },
          }
        }
        const { executePreparedTx } = await import(
          "@/server/services/wallet/executor"
        )
        return executePreparedTx({
          userId: ctx.userId,
          agentMode: ctx.decisionOrigin,
          requireAutonomous: isAuto,
          prepared: {
            chainId: q.chainId,
            to: q.to,
            data: q.data || "0x",
            value: q.value,
            category: q.category,
            responsePayload: q.responsePayload,
            conversationId: ctx.conversationId,
            tradeIntentId: q.tradeIntentId ?? null,
          },
        })
      },
    },
  }
}
