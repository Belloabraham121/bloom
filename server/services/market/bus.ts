/**
 * Pub/sub + recent buffer for market ticks, agent events, and canvas patches.
 * In-process EventEmitter always works; Redis is best-effort for multi-instance.
 */

import { EventEmitter } from "events"
import {
  ensureRedisConnected,
  getRedis,
  getRedisSubscriber,
  isRedisCircuitOpen,
  redisEnabled,
} from "@/server/services/redis/client"

export type MarketEvent = {
  type: "market"
  chainId: number
  pool?: string
  token0?: string
  token1?: string
  symbol0?: string
  symbol1?: string
  amount0?: string
  amount1?: string
  price?: string
  block?: number
  tx?: string
  at: string
}

export type AgentEventStep =
  | "signal"
  | "deciding"
  | "quoting"
  | "signing"
  | "submitted"
  | "confirmed"
  | "failed"
  | "canvas_patch"
  | "status"

export type AgentEvent = {
  type: "agent"
  userId: string
  missionId?: string
  step: AgentEventStep
  message: string
  payload?: Record<string, unknown>
  at: string
}

export type CanvasPatch = {
  type: "canvas_patch"
  userId: string
  conversationId?: string | null
  op: "set" | "replace" | "insert" | "remove" | "full" | "add_dashboard" | "move"
  widgetId?: string
  path?: string
  kind?: string
  openuiDocument?: string | null
  revision?: number
  data?: unknown
  x?: number
  y?: number
  at: string
}

export type BusMessage = MarketEvent | AgentEvent | CanvasPatch

function marketChannel(chainId: number) {
  return `bloom:market:${chainId}`
}

function agentChannel(userId: string) {
  return `bloom:agent:${userId}`
}

function recentKey(channel: string) {
  return `bloom:recent:${channel}`
}

const localBus = new EventEmitter()
localBus.setMaxListeners(200)
const recentMemory = new Map<string, string[]>()

function pushRecent(channel: string, raw: string) {
  const list = recentMemory.get(channel) || []
  list.unshift(raw)
  recentMemory.set(channel, list.slice(0, 100))
}

async function publish(channel: string, message: BusMessage) {
  const raw = JSON.stringify(message)
  pushRecent(channel, raw)
  localBus.emit(channel, message)

  if (!redisEnabled() || isRedisCircuitOpen()) return

  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    await redis.publish(channel, raw)
    await redis.lpush(recentKey(channel), raw)
    await redis.ltrim(recentKey(channel), 0, 99)
  } catch {
    /* local only */
  }
}

export async function publishMarketEvent(
  event: Omit<MarketEvent, "type" | "at"> & { at?: string }
) {
  const full: MarketEvent = {
    type: "market",
    at: event.at ?? new Date().toISOString(),
    ...event,
  }
  await publish(marketChannel(event.chainId), full)
  return full
}

export async function publishAgentEvent(
  event: Omit<AgentEvent, "type" | "at"> & { at?: string }
) {
  const full: AgentEvent = {
    type: "agent",
    at: event.at ?? new Date().toISOString(),
    ...event,
  }
  await publish(agentChannel(event.userId), full)
  return full
}

export async function publishCanvasPatch(
  patch: Omit<CanvasPatch, "type" | "at"> & { at?: string }
) {
  const full: CanvasPatch = {
    type: "canvas_patch",
    at: patch.at ?? new Date().toISOString(),
    ...patch,
  }
  await publish(agentChannel(patch.userId), full)
  return full
}

export async function getRecentMessages(
  channel: string,
  limit = 30
): Promise<BusMessage[]> {
  const fromMemory = (recentMemory.get(channel) || [])
    .slice(0, limit)
    .map((r) => {
      try {
        return JSON.parse(r) as BusMessage
      } catch {
        return null
      }
    })
    .filter(Boolean) as BusMessage[]

  if (!redisEnabled() || isRedisCircuitOpen()) return fromMemory

  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    const rows = await redis.lrange(recentKey(channel), 0, limit - 1)
    const fromRedis = rows
      .map((r) => {
        try {
          return JSON.parse(r) as BusMessage
        } catch {
          return null
        }
      })
      .filter(Boolean) as BusMessage[]
    if (fromRedis.length) return fromRedis
  } catch {
    /* redis optional */
  }

  return fromMemory
}

export async function getRecentMarketEvents(chainId: number, limit = 30) {
  return (await getRecentMessages(marketChannel(chainId), limit)).filter(
    (m): m is MarketEvent => m.type === "market"
  )
}

export async function getRecentAgentEvents(userId: string, limit = 30) {
  return getRecentMessages(agentChannel(userId), limit)
}

/**
 * Subscribe to channels; returns unsubscribe fn.
 * Always listens in-process; Redis subscribe is best-effort.
 */
export async function subscribeChannels(
  channels: string[],
  onMessage: (channel: string, message: BusMessage) => void
): Promise<() => Promise<void>> {
  const localHandlers: Array<{ channel: string; fn: (msg: BusMessage) => void }> =
    []
  // Deduplicate local+Redis double delivery in the same process
  const seen = new Set<string>()
  const deliver = (channel: string, message: BusMessage) => {
    const key = `${channel}:${message.type}:${message.at}:${(message as Record<string,unknown>).revision ?? ""}:${(message as Record<string,unknown>).widgetId ?? ""}`
    if (seen.has(key)) return
    seen.add(key)
    if (seen.size > 300) {
      const first = seen.values().next().value
      if (first) seen.delete(first)
    }
    onMessage(channel, message)
  }

  for (const channel of channels) {
    const fn = (msg: BusMessage) => deliver(channel, msg)
    localBus.on(channel, fn)
    localHandlers.push({ channel, fn })
  }

  let redisCleanup: (() => Promise<void>) | null = null
  if (redisEnabled() && !isRedisCircuitOpen()) {
    try {
      const sub = getRedisSubscriber()
      await ensureRedisConnected(sub)

      const handler = (channel: string, raw: string) => {
        if (!channels.includes(channel)) return
        try {
          deliver(channel, JSON.parse(raw) as BusMessage)
        } catch {
          /* ignore */
        }
      }

      sub.on("message", handler)
      if (channels.length) await sub.subscribe(...channels)

      redisCleanup = async () => {
        sub.off("message", handler)
        if (channels.length) await sub.unsubscribe(...channels)
      }
    } catch {
      /* local only */
    }
  }

  return async () => {
    for (const { channel, fn } of localHandlers) {
      localBus.off(channel, fn)
    }
    await redisCleanup?.()
  }
}

export { marketChannel, agentChannel }
