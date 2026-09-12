import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { getLiveSession } from "@/server/services/market/live-session"
import { listMissionsForUser } from "@/server/services/missions/repo"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const session = await getLiveSession(user.id)

    if (session) {
      return NextResponse.json({
        active: !session.paused,
        session,
        runningMissions: session.missionId
          ? [{ id: session.missionId, status: session.paused ? "paused" : "running" }]
          : [],
      })
    }

    let running: Awaited<ReturnType<typeof listMissionsForUser>> = []
    try {
      const missions = await Promise.race([
        listMissionsForUser(user.id, 10),
        new Promise<Awaited<ReturnType<typeof listMissionsForUser>>>((resolve) =>
          setTimeout(() => resolve([]), 500)
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
