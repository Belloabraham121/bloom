import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { getLiveSession } from "@/server/services/market/live-session"
import { listMissionsForUser } from "@/server/services/missions/repo"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const session = await getLiveSession(user.id)
    const missions = await listMissionsForUser(user.id, 10)
    const running = missions.filter((m) => m.status === "running")
    return NextResponse.json({
      active: Boolean(session) || running.length > 0,
      session,
      runningMissions: running,
    })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status }
    )
  }
}
