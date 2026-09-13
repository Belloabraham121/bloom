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
      const addr = String(body.walletAddress).toLowerCase()
      // Validate wallet address format
      if (!/^0x[a-f0-9]{40}$/i.test(addr)) {
        return NextResponse.json({ error: "Invalid wallet address format" }, { status: 400 })
      }
      // If privyWalletId is provided, the Privy embedded wallet is being linked.
      // The auth token already proves identity; the privyWalletId must be non-empty.
      if (body.privyWalletId && typeof body.privyWalletId !== "string") {
        return NextResponse.json({ error: "Invalid privyWalletId" }, { status: 400 })
      }
      await upsertUserWallet({
        userId: user.id,
        address: addr,
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
    // Step-up: escalation to autonomous requires explicit confirmation flag
    if (mode === "autonomous" && user.agentMode !== "autonomous") {
      if (!body.confirmEscalation) {
        return NextResponse.json(
          { error: "Escalation to autonomous requires confirmEscalation: true", requiresConfirmation: true },
          { status: 403 }
        )
      }
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
