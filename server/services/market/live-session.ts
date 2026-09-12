/**
 * Per-user live session — only active when the agent starts real-time for a purpose.
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

export async function startLiveSession(session: LiveSession): Promise<LiveSession> {
  const redis = getRedis()
  await ensureRedisConnected(redis)
  await redis.set(key(session.userId), JSON.stringify(session), "EX", 60 * 60 * 12)
  return session
}

export async function stopLiveSession(userId: string): Promise<void> {
  const redis = getRedis()
  await ensureRedisConnected(redis)
  await redis.del(key(userId))
}

export async function getLiveSession(userId: string): Promise<LiveSession | null> {
  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    const raw = await redis.get(key(userId))
    if (!raw) return null
    return JSON.parse(raw) as LiveSession
  } catch {
    return null
  }
}
