/**
 * Mission runner — consumes market events and drives strategies.
 * Hardened: auto-restart subscribe, heartbeat, multi-chain channels.
 */

import {
  marketChannel,
  subscribeChannels,
  type MarketEvent,
} from "@/server/services/market/bus"
import {
  getMission,
  isKillSwitchOn,
  listRunningMissions,
  updateMission,
} from "./repo"
import { runStrategyOnEvent } from "./strategies"
import type { MissionGuardrails, MissionParams } from "./types"
import { db } from "@/server/services/db/client"
import { users } from "@/server/services/db/schema"
import { eq } from "drizzle-orm"
import type { AgentMode } from "@/lib/types"
import { publishAgentEvent } from "@/server/services/market/bus"

const lastRun = new Map<string, number>()

let cachedMissions: { missions: Awaited<ReturnType<typeof listRunningMissions>>; expiresAt: number } | null = null
const CACHE_TTL = 10_000

async function getRunningMissions() {
  if (cachedMissions && cachedMissions.expiresAt > Date.now()) {
    return cachedMissions.missions
  }
  const missions = await listRunningMissions()
  cachedMissions = { missions, expiresAt: Date.now() + CACHE_TTL }
  return missions
}

let started = false
let starting: Promise<void> | null = null
let unsubscribe: (() => Promise<void>) | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let lastHeartbeatAt = 0
let restartCount = 0

const MARKET_CHAINS = [1, 10, 137, 8453, 42161]
const HEARTBEAT_MS = 30_000

async function handleMarket(event: MarketEvent) {
  const running = await getRunningMissions()
  for (const mission of running) {
    if (await isKillSwitchOn(mission.userId)) {
      await updateMission(mission.id, mission.userId, {
        status: "paused",
        lastError: "Kill switch on",
      })
      await publishAgentEvent({
        userId: mission.userId,
        missionId: mission.id,
        step: "status",
        message: "Mission paused — kill switch",
      })
      continue
    }

    const params = (mission.params || {}) as MissionParams
    const guardrails = (mission.guardrails || {}) as MissionGuardrails
    if (params.chainId != null && event.chainId !== params.chainId) {
      continue
    }
    if (
      Array.isArray(guardrails.allowlistChainIds) &&
      guardrails.allowlistChainIds.length &&
      !guardrails.allowlistChainIds.includes(event.chainId)
    ) {
      continue
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, mission.userId),
    })
    const agentMode = (user?.agentMode as AgentMode) || "human_mediated"

    const result = await runStrategyOnEvent(
      {
        missionId: mission.id,
        userId: mission.userId,
        conversationId: mission.conversationId,
        strategy: mission.strategy as never,
        params,
        guardrails,
        agentMode,
        minEdgeBps: guardrails.minEdgeBps ?? 10,
        lastRunAt: lastRun.get(mission.id),
        cooldownMs: guardrails.cooldownMs ?? 60_000,
      },
      event
    )

    if (result.acted && result.message !== "cooldown") {
      lastRun.set(mission.id, Date.now())
      await updateMission(mission.id, mission.userId, {
        lastActivityAt: new Date(),
        lastError: result.message.startsWith("submitted")
          ? null
          : result.message.includes("fail") ||
              result.message.includes("Blocked") ||
              result.message.includes("cap")
            ? result.message
            : null,
        cursor: event.tx || event.block?.toString() || mission.cursor,
      })
    }
  }
}

async function subscribeOnce() {
  if (unsubscribe) {
    try {
      await unsubscribe()
    } catch {
      /* ignore */
    }
    unsubscribe = null
  }

  unsubscribe = await subscribeChannels(
    MARKET_CHAINS.map((id) => marketChannel(id)),
    async (_channel, message) => {
      if (message.type === "market") {
        await handleMarket(message)
      }
    }
  )
  lastHeartbeatAt = Date.now()
  console.info(
    `[mission-runner] subscribed to market channels (${MARKET_CHAINS.join(",")})`
  )
}

function startHeartbeat() {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    lastHeartbeatAt = Date.now()
    void listRunningMissions()
      .then((rows) => {
        if (rows.length > 0 && !unsubscribe) {
          console.warn("[mission-runner] heartbeat: resubscribing (no sub)")
          void subscribeOnce().catch((e) =>
            console.warn("[mission-runner] resubscribe failed", e)
          )
        }
      })
      .catch(() => {
        /* db flake */
      })
  }, HEARTBEAT_MS)
  if (typeof heartbeatTimer === "object" && "unref" in heartbeatTimer) {
    heartbeatTimer.unref?.()
  }
}

export async function ensureMissionRunner(): Promise<void> {
  if (started) return
  if (starting) return starting

  starting = (async () => {
    try {
      await subscribeOnce()
      started = true
      restartCount = 0
      startHeartbeat()
    } catch (error) {
      started = false
      restartCount += 1
      console.warn("[mission-runner] failed to start", error)
      if (restartCount <= 5) {
        const delay = Math.min(1000 * 2 ** restartCount, 30_000)
        setTimeout(() => {
          starting = null
          void ensureMissionRunner()
        }, delay)
      }
      throw error
    } finally {
      starting = null
    }
  })()

  return starting
}

export function getMissionRunnerStatus() {
  return {
    started,
    subscribed: Boolean(unsubscribe),
    lastHeartbeatAt,
    restartCount,
    channels: MARKET_CHAINS,
  }
}

export async function stopMissionRunner() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (unsubscribe) await unsubscribe()
  unsubscribe = null
  started = false
  starting = null
}

export async function kickMission(missionId: string, userId: string) {
  await ensureMissionRunner().catch(() => null)
  const mission = await getMission(missionId, userId)
  if (!mission || mission.status !== "running") {
    return { ok: false, error: "Mission not running" }
  }
  await publishAgentEvent({
    userId,
    missionId,
    step: "status",
    message: "Mission running — waiting for market signals",
    payload: { runner: getMissionRunnerStatus() },
  })
  return { ok: true, runner: getMissionRunnerStatus() }
}
