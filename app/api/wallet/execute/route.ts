import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { executePreparedTx } from "@/server/services/wallet/executor"

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const body = (await request.json()) as {
      chainId: number
      to: string
      data: string
      value?: string
      category?: string
      responsePayload?: unknown
      requestPayload?: unknown
      conversationId?: string | null
      requireAutonomous?: boolean
      tradeIntentId?: string | null
    }

    if (!body.chainId || !body.to) {
      return NextResponse.json(
        { error: "chainId and to are required" },
        { status: 400 }
      )
    }

    const result = await executePreparedTx({
      userId: user.id,
      agentMode: user.agentMode,
      requireAutonomous: Boolean(body.requireAutonomous),
      prepared: {
        chainId: body.chainId,
        to: body.to,
        data: body.data || "0x",
        value: body.value,
        category: body.category,
        responsePayload: body.responsePayload,
        requestPayload: body.requestPayload,
        conversationId: body.conversationId,
        tradeIntentId: body.tradeIntentId ?? null,
      },
    })

    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status }
    )
  }
}
