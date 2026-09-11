import type { AgentMode } from "@/lib/types"
import { uniswapFetch } from "./http"
import { resolveExecutionPath, stripQuoteForSwap, type ExecutionPath } from "./routing"

export type DecisionOrigin = AgentMode

async function withOrigin<T>(
  decisionOrigin: DecisionOrigin,
  fn: () => Promise<T>
): Promise<T> {
  return fn()
}

export const tradeClient = {
  checkApproval(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/check_approval", method: "POST", body, decisionOrigin })
    )
  },

  quote(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/quote", method: "POST", body, decisionOrigin })
    )
  },

  swap(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/swap", method: "POST", body, decisionOrigin })
    )
  },

  swap5792(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/swap_5792", method: "POST", body, decisionOrigin })
    )
  },

  swap7702(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/swap_7702", method: "POST", body, decisionOrigin })
    )
  },

  order(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/order", method: "POST", body, decisionOrigin })
    )
  },

  getOrders(
    query: Record<string, string | number | boolean | undefined>,
    decisionOrigin: DecisionOrigin = "human_mediated"
  ) {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/orders", method: "GET", query, decisionOrigin })
    )
  },

  getSwaps(
    query: Record<string, string | number | boolean | undefined>,
    decisionOrigin: DecisionOrigin = "human_mediated"
  ) {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/swaps", method: "GET", query, decisionOrigin })
    )
  },

  createPlan(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/plan", method: "POST", body, decisionOrigin })
    )
  },

  getPlan(
    planId: string,
    query?: Record<string, string | number | boolean | undefined>,
    decisionOrigin: DecisionOrigin = "human_mediated"
  ) {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({
        path: `/plan/${encodeURIComponent(planId)}`,
        method: "GET",
        query,
        decisionOrigin,
      })
    )
  },

  updatePlan(
    planId: string,
    body: unknown,
    decisionOrigin: DecisionOrigin = "human_mediated"
  ) {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({
        path: `/plan/${encodeURIComponent(planId)}`,
        method: "PATCH",
        body,
        decisionOrigin,
      })
    )
  },

  encode7702(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({
        path: "/wallet/encode_7702",
        method: "POST",
        body,
        decisionOrigin,
      })
    )
  },

  checkDelegation(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({
        path: "/wallet/check_delegation",
        method: "POST",
        body,
        decisionOrigin,
      })
    )
  },

  permissions(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/permissions", method: "POST", body, decisionOrigin })
    )
  },

  swappableTokens(
    query?: Record<string, string | number | boolean | undefined>,
    decisionOrigin: DecisionOrigin = "human_mediated"
  ) {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({
        path: "/swappable_tokens",
        method: "GET",
        query,
        decisionOrigin,
      })
    )
  },

  supportedChains(decisionOrigin: DecisionOrigin = "human_mediated") {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/supported_chains", method: "GET", decisionOrigin })
    )
  },

  tokens(
    query?: Record<string, string | number | boolean | undefined>,
    decisionOrigin: DecisionOrigin = "human_mediated"
  ) {
    return withOrigin(decisionOrigin, () =>
      uniswapFetch({ path: "/tokens", method: "GET", query, decisionOrigin })
    )
  },

  /**
   * After a quote, build the next request for order/swap/plan/batch.
   */
  async prepareExecution(params: {
    quote: Record<string, unknown>
    preferBatch?: "swap_5792" | "swap_7702" | null
    decisionOrigin?: DecisionOrigin
  }): Promise<{ path: ExecutionPath; result: unknown }> {
    const decisionOrigin = params.decisionOrigin ?? "human_mediated"
    const routing = String(params.quote.routing ?? "")
    const path = resolveExecutionPath(routing, params.preferBatch ?? null)

    if (path === "plan") {
      const result = await this.createPlan(
        {
          routing: "CHAINED",
          quote: params.quote.quote ?? params.quote,
        },
        decisionOrigin
      )
      return { path, result }
    }

    if (path === "order") {
      const result = await this.order(params.quote, decisionOrigin)
      return { path, result }
    }

    const { clean, permitData } = stripQuoteForSwap(params.quote)
    const body = {
      ...clean,
      ...(permitData ? { permitData } : {}),
    }

    if (path === "swap_5792") {
      return { path, result: await this.swap5792(body, decisionOrigin) }
    }
    if (path === "swap_7702") {
      return { path, result: await this.swap7702(body, decisionOrigin) }
    }

    return { path, result: await this.swap(body, decisionOrigin) }
  },
}

export const liquidityClient = {
  checkApproval(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return uniswapFetch({
      path: "/lp/check_approval",
      method: "POST",
      body,
      decisionOrigin,
    })
  },
  create(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return uniswapFetch({ path: "/lp/create", method: "POST", body, decisionOrigin })
  },
  increase(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return uniswapFetch({
      path: "/lp/increase",
      method: "POST",
      body,
      decisionOrigin,
    })
  },
  decrease(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return uniswapFetch({
      path: "/lp/decrease",
      method: "POST",
      body,
      decisionOrigin,
    })
  },
  claimFees(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return uniswapFetch({
      path: "/lp/claim_fees",
      method: "POST",
      body,
      decisionOrigin,
    })
  },
  createClassic(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return uniswapFetch({
      path: "/lp/create_classic",
      method: "POST",
      body,
      decisionOrigin,
    })
  },
  poolInfo(body: unknown, decisionOrigin: DecisionOrigin = "human_mediated") {
    return uniswapFetch({
      path: "/lp/pool_info",
      method: "POST",
      body,
      decisionOrigin,
    })
  },
}
