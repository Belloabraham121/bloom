/**
 * Per-user live session — memory first, Redis when available.
 */

import {
  ensureRedisConnected,
  getRedis,
  isRedisCircuitOpen,
  redisEnabled,
} from "@/server/services/redis/client"

export type LiveSession = {
  userId: string
  conversationId: string | null
  chainId: number
  purpose: string
  missionId?: string | null
  symbol0?: string
  symbol1?: string
  paused?: boolean
  startedAt: string
}

function key(userId: string) {
  return `bloom:live:${userId}`
}

const memory = new Map<string, LiveSession>()

async function redisSet(userId: string, session: LiveSession) {
  if (!redisEnabled() || isRedisCircuitOpen()) return
  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    await redis.set(key(userId), JSON.stringify(session), "EX", 60 * 60 * 12)
  } catch {
    /* memory only */
  }
}

export async function startLiveSession(session: LiveSession): Promise<LiveSession> {
  const next: LiveSession = {
    ...session,
    symbol0: session.symbol0 || "USDC",
    symbol1: session.symbol1 || "ETH",
    paused: session.paused ?? false,
  }
  memory.set(session.userId, next)
  await redisSet(session.userId, next)
  return next
}

export async function patchLiveSession(
  userId: string,
  patch: Partial<LiveSession>
): Promise<LiveSession | null> {
  const current = await getLiveSession(userId)
  if (!current) return null
  const next = { ...current, ...patch, userId }
  memory.set(userId, next)
  await redisSet(userId, next)
  return next
}

export async function stopLiveSession(userId: string): Promise<void> {
  memory.delete(userId)
  if (!redisEnabled() || isRedisCircuitOpen()) return
  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    await redis.del(key(userId))
  } catch {
    /* ignore */
  }
}

export async function getLiveSession(userId: string): Promise<LiveSession | null> {
  const local = memory.get(userId)
  if (local) return local
  if (!redisEnabled() || isRedisCircuitOpen()) return null
  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    const raw = await redis.get(key(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as LiveSession
    memory.set(userId, parsed)
    return parsed
  } catch {
    return null
  }
}
