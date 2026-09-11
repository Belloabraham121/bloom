import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { tradeClient } from "@/server/services/uniswap/trade.client"

const ACTIONS = new Set([
  "check_approval",
  "quote",
  "swap",
  "order",
  "orders",
  "swaps",
  "swap_5792",
  "swap_7702",
  "plan",
  "encode_7702",
  "check_delegation",
  "permissions",
  "swappable_tokens",
  "supported_chains",
  "tokens",
])

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> }
) {
  try {
    const user = await requirePrivyUser(request)
    const { action } = await context.params
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const origin = user.agentMode

    let result: unknown
    switch (action) {
      case "check_approval":
        result = await tradeClient.checkApproval(body, origin)
        break
      case "quote":
        result = await tradeClient.quote(body, origin)
        break
      case "swap":
        result = await tradeClient.swap(body, origin)
        break
      case "order":
        result = await tradeClient.order(body, origin)
        break
      case "orders":
        result = await tradeClient.getOrders(body?.query ?? body, origin)
        break
      case "swaps":
        result = await tradeClient.getSwaps(body?.query ?? body, origin)
        break
      case "swap_5792":
        result = await tradeClient.swap5792(body, origin)
        break
      case "swap_7702":
        result = await tradeClient.swap7702(body, origin)
        break
      case "plan":
        result = await tradeClient.createPlan(body, origin)
        break
      case "encode_7702":
        result = await tradeClient.encode7702(body, origin)
        break
      case "check_delegation":
        result = await tradeClient.checkDelegation(body, origin)
        break
      case "permissions":
        result = await tradeClient.permissions(body, origin)
        break
      case "swappable_tokens":
        result = await tradeClient.swappableTokens(body?.query ?? body, origin)
        break
      case "supported_chains":
        result = await tradeClient.supportedChains(origin)
        break
      case "tokens":
        result = await tradeClient.tokens(body?.query ?? body, origin)
        break
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Uniswap trade failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
