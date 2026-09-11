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
      description: "Get a Uniswap Trading API quote (routing decides next step)",
      parameters: z.object({
        body: z.record(z.string(), z.unknown()),
      }),
      execute: async (args) => {
        const { body } = asObject(args) as { body: Record<string, unknown> }
        const quote = (await tradeClient.quote(body, origin(ctx))) as Record<
          string,
          unknown
        >
        const routing = String(quote.routing ?? "")
        return { quote, suggestedPath: resolveExecutionPath(routing) }
      },
    },

    create_swap_calldata: {
      description: "Create classic/bridge/wrap swap calldata from a quote via POST /swap",
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
        return prepared
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

    get_bridgable_tokens: {
      description: "List bridgable / swappable tokens",
      parameters: z.object({
        chainId: z.number().optional(),
      }),
      execute: async (args) => {
        const { chainId } = asObject(args) as { chainId?: number }
        return tradeClient.swappableTokens(
          chainId ? { chainId } : undefined,
          origin(ctx)
        )
      },
    },

    get_supported_chains: {
      description: "List Uniswap Trading API supported chains",
      parameters: z.object({}),
      execute: async () => tradeClient.supportedChains(origin(ctx)),
    },

    get_tokens: {
      description: "Search or list tokens from Uniswap Trading API",
      parameters: z.object({
        chainId: z.number().optional(),
        search: z.string().optional(),
      }),
      execute: async (args) => {
        const q = asObject(args)
        return tradeClient.tokens(
          {
            chainId: typeof q.chainId === "number" ? q.chainId : undefined,
            search: typeof q.search === "string" ? q.search : undefined,
          },
          origin(ctx)
        )
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
        "Live tokens that appear in top Uniswap pools for a version+chain (The Graph). Use for pool-token discovery across V2/V3/V4 — not Trading API token search.",
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
        return getTokensInPools(q)
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
  }
}
