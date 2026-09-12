/**
 * Per-user live session — memory first, Redis when available.
 * Only active when the agent starts real-time for a purpose.
 */

import { ensureRedisConnected, getRedis } from "@/server/services/redis/client"

export type LiveSession = {
  userId: string
  conversationId: string | null
  chainId: number
  purpose: string
  missionId?: string | null
  startedAt: string
}

function key(userId: string) {
  return `bloom:live:${userId}`
}

const memory = new Map<string, LiveSession>()

export async function startLiveSession(session: LiveSession): Promise<LiveSession> {
  memory.set(session.userId, session)
  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    await redis.set(key(session.userId), JSON.stringify(session), "EX", 60 * 60 * 12)
  } catch (error) {
    console.warn("[live-session] redis set failed — using memory", error)
  }
  return session
}

export async function stopLiveSession(userId: string): Promise<void> {
  memory.delete(userId)
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
