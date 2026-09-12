/**
 * Mission runner — consumes market events and drives strategies.
 */

import {
  agentChannel,
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
let started = false
let unsubscribe: (() => Promise<void>) | null = null

async function handleMarket(event: MarketEvent) {
  const running = await listRunningMissions()
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
    if (
      params.chainId != null &&
      event.chainId !== params.chainId
    ) {
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
          : result.message.includes("fail")
            ? result.message
            : null,
        cursor: event.tx || event.block?.toString() || mission.cursor,
      })
    }
  }
}

export async function ensureMissionRunner(): Promise<void> {
  if (started) return
  started = true

  try {
    // Subscribe broadly to eth mainnet market channel; extend as needed.
    unsubscribe = await subscribeChannels(
      [marketChannel(1), marketChannel(8453), marketChannel(42161)],
      async (_channel, message) => {
        if (message.type === "market") {
          await handleMarket(message)
        }
      }
    )
    console.info("[mission-runner] subscribed to market channels")
  } catch (error) {
    started = false
    console.warn("[mission-runner] failed to start", error)
  }
}

export async function stopMissionRunner() {
  if (unsubscribe) await unsubscribe()
  unsubscribe = null
  started = false
}

export async function kickMission(missionId: string, userId: string) {
  const mission = await getMission(missionId, userId)
  if (!mission || mission.status !== "running") {
    return { ok: false, error: "Mission not running" }
  }
  await publishAgentEvent({
    userId,
    missionId,
    step: "status",
    message: "Mission running — waiting for market signals",
  })
  return { ok: true }
}
