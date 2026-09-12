import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { publishAgentEvent } from "@/server/services/market/bus"
import {
  ensureLiveIngest,
  stopLiveIngest,
} from "@/server/services/market/ingest"
import {
  getLiveSession,
  patchLiveSession,
  startLiveSession,
  stopLiveSession,
} from "@/server/services/market/live-session"
import { patchCanvasForUser } from "@/server/services/canvas/store"
import {
  listMissionsForUser,
  updateMission,
} from "@/server/services/missions/repo"

export const runtime = "nodejs"

const PRESETS = [
  { symbol0: "USDC", symbol1: "ETH", label: "USDC/ETH" },
  { symbol0: "USDC", symbol1: "WBTC", label: "USDC/WBTC" },
  { symbol0: "DAI", symbol1: "ETH", label: "DAI/ETH" },
  { symbol0: "USDT", symbol1: "ETH", label: "USDT/ETH" },
]

async function resolveMissionId(userId: string, missionId?: string | null) {
  if (missionId) return missionId
  const session = await getLiveSession(userId)
  if (session?.missionId) return session.missionId
  try {
    const rows = await listMissionsForUser(userId, 10)
    const running = rows.find((m) => m.status === "running" || m.status === "paused")
    return running?.id ?? null
  } catch {
    return null
  }
}

export async function GET() {
  return NextResponse.json({ presets: PRESETS })
}

/**
 * Live market controls: switch pair / pause / resume / stop (no chat round-trip).
 */
export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const body = (await request.json()) as {
      action?: "switch" | "pause" | "resume" | "stop"
      symbol0?: string
      symbol1?: string
      chainId?: number
      conversationId?: string | null
      missionId?: string | null
    }

    const action = body.action
    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 })
    }

    const conversationId = body.conversationId ?? null
    const chainId = body.chainId ?? 1
    const missionId = await resolveMissionId(user.id, body.missionId)

    if (action === "switch") {
      const symbol0 = (body.symbol0 || "USDC").toUpperCase()
      const symbol1 = (body.symbol1 || "ETH").toUpperCase()
      ensureLiveIngest({
        chainId,
        symbol0,
        symbol1,
        userId: user.id,
      })
      const session = await startLiveSession({
        userId: user.id,
        conversationId,
        chainId,
        purpose: `market_watch:${symbol0}/${symbol1}`,
        missionId,
        symbol0,
        symbol1,
        paused: false,
        startedAt: new Date().toISOString(),
      })
      if (missionId) {
        try {
          await updateMission(missionId, user.id, {
            status: "running",
            params: { chainId, symbol0, symbol1 },
            lastActivityAt: new Date(),
          })
        } catch {
          /* optional */
        }
      }
      await patchCanvasForUser({
        userId: user.id,
        conversationId,
        patch: {
          op: "replace",
          widgetId: "_live",
          kind: "custom",
          data: {
            active: true,
            paused: false,
            chainId,
            missionId,
            symbol0,
            symbol1,
            purpose: session.purpose,
          },
        },
      })
      await publishAgentEvent({
        userId: user.id,
        missionId: missionId ?? undefined,
        step: "status",
        message: `Switched live market → ${symbol1}/${symbol0}`,
      })
      return NextResponse.json({
        ok: true,
        liveActive: true,
        working: true,
        session,
        symbol0,
        symbol1,
      })
    }

    if (action === "pause") {
      stopLiveIngest()
      await patchLiveSession(user.id, { paused: true })
      if (missionId) {
        try {
          await updateMission(missionId, user.id, { status: "paused" })
        } catch {
          /* optional */
        }
      }
      await patchCanvasForUser({
        userId: user.id,
        conversationId,
        patch: {
          op: "set",
          widgetId: "_live",
          data: { paused: true, active: true },
        },
      })
      await publishAgentEvent({
        userId: user.id,
        missionId: missionId ?? undefined,
        step: "status",
        message: "Live market paused",
      })
      return NextResponse.json({ ok: true, liveActive: true, working: false })
    }

    if (action === "resume") {
      const session = await getLiveSession(user.id)
      const symbol0 = session?.symbol0 || "USDC"
      const symbol1 = session?.symbol1 || "ETH"
      const cid = session?.chainId || chainId
      ensureLiveIngest({
        chainId: cid,
        symbol0,
        symbol1,
        userId: user.id,
      })
      await patchLiveSession(user.id, { paused: false })
      if (missionId) {
        try {
          await updateMission(missionId, user.id, {
            status: "running",
            lastActivityAt: new Date(),
          })
        } catch {
          /* optional */
        }
      }
      await patchCanvasForUser({
        userId: user.id,
        conversationId,
        patch: {
          op: "set",
          widgetId: "_live",
          data: { paused: false, active: true, symbol0, symbol1 },
        },
      })
      await publishAgentEvent({
        userId: user.id,
        missionId: missionId ?? undefined,
        step: "status",
        message: "Live market resumed",
      })
      return NextResponse.json({ ok: true, liveActive: true, working: true })
    }

    if (action === "stop") {
      stopLiveIngest()
      await stopLiveSession(user.id)
      if (missionId) {
        try {
          await updateMission(missionId, user.id, { status: "stopped" })
        } catch {
          /* optional */
        }
      }
      await patchCanvasForUser({
        userId: user.id,
        conversationId,
        patch: {
          op: "replace",
          widgetId: "_live",
          kind: "custom",
          data: { active: false, paused: false },
        },
      })
      await publishAgentEvent({
        userId: user.id,
        missionId: missionId ?? undefined,
        step: "status",
        message: "Live market stopped",
      })
      return NextResponse.json({ ok: true, liveActive: false, working: false })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status }
    )
  }
}
