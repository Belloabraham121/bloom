import { NextResponse } from "next/server"
import {
  requirePrivyUser,
  updateAgentMode,
  upsertUserWallet,
} from "@/server/lib/auth"
import type { AgentMode } from "@/lib/types"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    return NextResponse.json({
      id: user.id,
      privyUserId: user.privyUserId,
      email: user.email,
      agentMode: user.agentMode,
    })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const body = await request.json()
    if (body.walletAddress) {
      await upsertUserWallet({
        userId: user.id,
        address: String(body.walletAddress),
        privyWalletId: body.privyWalletId ? String(body.privyWalletId) : null,
        email: body.email ? String(body.email) : user.email,
      })
    }
    return NextResponse.json({ ok: true, userId: user.id })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const body = await request.json()
    const mode = body.agentMode as AgentMode
    if (mode !== "human_mediated" && mode !== "autonomous") {
      return NextResponse.json({ error: "Invalid agentMode" }, { status: 400 })
    }
    const updated = await updateAgentMode(user.id, mode)
    return NextResponse.json({
      agentMode: updated.agentMode,
    })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
