import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { liquidityClient } from "@/server/services/uniswap/trade.client"

const ACTIONS = new Set([
  "check_approval",
  "create",
  "increase",
  "decrease",
  "claim_fees",
  "create_classic",
  "pool_info",
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

    const map: Record<string, () => Promise<unknown>> = {
      check_approval: () => liquidityClient.checkApproval(body, origin),
      create: () => liquidityClient.create(body, origin),
      increase: () => liquidityClient.increase(body, origin),
      decrease: () => liquidityClient.decrease(body, origin),
      claim_fees: () => liquidityClient.claimFees(body, origin),
      create_classic: () => liquidityClient.createClassic(body, origin),
      pool_info: () => liquidityClient.poolInfo(body, origin),
    }

    const result = await map[action]()
    return NextResponse.json(result)
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "LP request failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
