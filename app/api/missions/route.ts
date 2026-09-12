import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import {
  createMission,
  getMission,
  listMissionsForUser,
  setKillSwitch,
  updateMission,
} from "@/server/services/missions/repo"
import { kickMission } from "@/server/services/missions/runner"
import { publishAgentEvent } from "@/server/services/market/bus"
import type { MissionStrategy } from "@/server/services/missions/types"
import { ensureLiveIngest } from "@/server/services/market/ingest"
import {
  startLiveSession,
  stopLiveSession,
  getLiveSession,
  patchLiveSession,
} from "@/server/services/market/live-session"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const rows = await listMissionsForUser(user.id)
    const session = await getLiveSession(user.id)
    return NextResponse.json({
      missions: rows,
      liveSession: session,
      liveActive: Boolean(session) || rows.some((m) => m.status === "running"),
    })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const body = (await request.json()) as {
      action?: string
      missionId?: string
      strategy?: MissionStrategy
      params?: Record<string, unknown>
      guardrails?: Record<string, unknown>
      conversationId?: string | null
      killSwitch?: boolean
    }

    if (body.action === "kill_switch") {
      const row = await setKillSwitch(user.id, Boolean(body.killSwitch))
      return NextResponse.json({ ok: true, agentKillSwitch: row?.agentKillSwitch })
    }

    if (body.action === "create") {
      if (!body.strategy) {
        return NextResponse.json({ error: "strategy required" }, { status: 400 })
      }
      const mission = await createMission({
        userId: user.id,
        conversationId: body.conversationId,
        strategy: body.strategy,
        params: body.params,
        guardrails: body.guardrails,
        status: "draft",
      })
      await publishAgentEvent({
        userId: user.id,
        missionId: mission.id,
        step: "status",
        message: `Mission created (${body.strategy})`,
      })
      return NextResponse.json({ mission })
    }

    if (!body.missionId) {
      return NextResponse.json({ error: "missionId required" }, { status: 400 })
    }

    const existing = await getMission(body.missionId, user.id)
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (body.action === "start") {
      const mission = await updateMission(body.missionId, user.id, {
        status: "running",
        lastError: null,
        lastActivityAt: new Date(),
      })
      const chainId =
        typeof (mission?.params as { chainId?: number } | null)?.chainId ===
        "number"
          ? (mission!.params as { chainId: number }).chainId
          : 1
      ensureLiveIngest({ chainId })
      await startLiveSession({
        userId: user.id,
        conversationId: mission?.conversationId ?? body.conversationId ?? null,
        chainId,
        purpose: String(mission?.strategy || "mission"),
        missionId: body.missionId,
        startedAt: new Date().toISOString(),
      })
      await kickMission(body.missionId, user.id)
      await publishAgentEvent({
        userId: user.id,
        missionId: body.missionId,
        step: "status",
        message: "Agent working — mission running",
      })
      return NextResponse.json({ mission, liveActive: true })
    }

    if (body.action === "pause") {
      const mission = await updateMission(body.missionId, user.id, {
        status: "paused",
      })
      const { stopLiveIngest } = await import("@/server/services/market/ingest")
      stopLiveIngest()
      await patchLiveSession(user.id, { paused: true }).catch(() => null)
      await publishAgentEvent({
        userId: user.id,
        missionId: body.missionId,
        step: "status",
        message: "Mission paused",
      })
      return NextResponse.json({ mission })
    }

    if (body.action === "stop") {
      const mission = await updateMission(body.missionId, user.id, {
        status: "stopped",
      })
      const { stopLiveIngest } = await import("@/server/services/market/ingest")
      stopLiveIngest()
      await stopLiveSession(user.id)
      await publishAgentEvent({
        userId: user.id,
        missionId: body.missionId,
        step: "status",
        message: "Mission stopped",
      })
      return NextResponse.json({ mission, liveActive: false })
    }

    if (body.action === "resume") {
      const mission = await updateMission(body.missionId, user.id, {
        status: "running",
        lastError: null,
      })
      const chainId =
        typeof (mission?.params as { chainId?: number } | null)?.chainId ===
        "number"
          ? (mission!.params as { chainId: number }).chainId
          : 1
      ensureLiveIngest({ chainId })
      await startLiveSession({
        userId: user.id,
        conversationId: mission?.conversationId ?? null,
        chainId,
        purpose: String(mission?.strategy || "mission"),
        missionId: body.missionId,
        startedAt: new Date().toISOString(),
      })
      await kickMission(body.missionId, user.id)
      return NextResponse.json({ mission, liveActive: true })
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
