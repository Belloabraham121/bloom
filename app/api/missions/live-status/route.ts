import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { getLiveSession } from "@/server/services/market/live-session"
import { listMissionsForUser } from "@/server/services/missions/repo"
import { getCanvasModel } from "@/server/services/canvas/store"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const session = await getLiveSession(user.id)
    const url = new URL(request.url)
    const conversationId = url.searchParams.get("conversationId")

    if (session) {
      return NextResponse.json({
        active: !session.paused,
        session,
        runningMissions: session.missionId
          ? [
              {
                id: session.missionId,
                status: session.paused ? "paused" : "running",
              },
            ]
          : [],
      })
    }

    // Heal: canvas _live.active when Redis/memory session was lost (HMR / multi-worker)
    try {
      const canvas = await getCanvasModel(user.id, conversationId)
      const live = canvas.widgets?._live?.props as
        | {
            active?: boolean
            paused?: boolean
            chainId?: number
            missionId?: string | null
            symbol0?: string
            symbol1?: string
            purpose?: string
          }
        | undefined
      if (live?.active) {
        return NextResponse.json({
          active: !live.paused,
          session: {
            userId: user.id,
            conversationId,
            chainId: live.chainId || 1,
            purpose: live.purpose || "market_watch",
            missionId: live.missionId ?? null,
            symbol0: live.symbol0 || "USDC",
            symbol1: live.symbol1 || "ETH",
            paused: Boolean(live.paused),
            startedAt: new Date().toISOString(),
          },
          runningMissions: live.missionId
            ? [
                {
                  id: live.missionId,
                  status: live.paused ? "paused" : "running",
                },
              ]
            : [],
          healedFromCanvas: true,
        })
      }
    } catch {
      /* ignore */
    }

    let running: Awaited<ReturnType<typeof listMissionsForUser>> = []
    try {
      const missions = await Promise.race([
        listMissionsForUser(user.id, 10),
        new Promise<Awaited<ReturnType<typeof listMissionsForUser>>>(
          (resolve) => setTimeout(() => resolve([]), 500)
        ),
      ])
      running = missions.filter((m) => m.status === "running")
    } catch {
      running = []
    }

    return NextResponse.json({
      active: running.length > 0,
      session: null,
      runningMissions: running,
    })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    // Don't hammer the client with opaque 500s on Privy/network timeouts
    if (status === 503 || status === 401) {
      return NextResponse.json(
        {
          active: false,
          session: null,
          runningMissions: [],
          error: error instanceof Error ? error.message : "Unauthorized",
        },
        { status }
      )
    }
    return NextResponse.json(
      {
        active: false,
        session: null,
        runningMissions: [],
        error: error instanceof Error ? error.message : "Error",
      },
      { status: 200 }
    )
  }
}
