/**
 * Redis client — optional. Circuit-breaks when Redis is down so API routes stay fast.
 */

import Redis from "ioredis"

const globalForRedis = globalThis as unknown as {
  bloomRedis?: Redis
  bloomRedisSub?: Redis
  bloomRedisCircuitOpenUntil?: number
}

function redisUrl() {
  return process.env.REDIS_URL || "redis://localhost:6380"
}

/** Skip Redis entirely when unset or explicitly disabled. */
export function redisEnabled() {
  if (process.env.REDIS_DISABLED === "1") return false
  if (process.env.REDIS_URL === "") return false
  return true
}

export function isRedisCircuitOpen() {
  return Date.now() < (globalForRedis.bloomRedisCircuitOpenUntil || 0)
}

function openCircuit(ms = 60_000) {
  globalForRedis.bloomRedisCircuitOpenUntil = Date.now() + ms
}

function redisOptions(extra: Record<string, unknown> = {}) {
  return {
    maxRetriesPerRequest: 1,
    connectTimeout: 400,
    commandTimeout: 400,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    ...extra,
  }
}

export function getRedis(): Redis {
  if (!globalForRedis.bloomRedis) {
    globalForRedis.bloomRedis = new Redis(redisUrl(), redisOptions())
    globalForRedis.bloomRedis.on("error", () => {
      openCircuit()
    })
  }
  return globalForRedis.bloomRedis
}

export function getRedisSubscriber(): Redis {
  if (!globalForRedis.bloomRedisSub) {
    globalForRedis.bloomRedisSub = new Redis(
      redisUrl(),
      redisOptions({ maxRetriesPerRequest: null })
    )
    globalForRedis.bloomRedisSub.on("error", () => {
      openCircuit()
    })
  }
  return globalForRedis.bloomRedisSub
}

export async function ensureRedisConnected(client: Redis = getRedis()) {
  if (!redisEnabled() || isRedisCircuitOpen()) {
    throw new Error("redis unavailable")
  }
  if (client.status === "ready") return

  try {
    if (client.status === "connecting") {
      await Promise.race([
        new Promise<void>((resolve) => client.once("ready", () => resolve())),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("redis connect timeout")), 400)
        ),
      ])
      return
    }
    if (
      client.status === "wait" ||
      client.status === "close" ||
      client.status === "end"
    ) {
      await Promise.race([
        client.connect(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("redis connect timeout")), 400)
        ),
      ])
    }
  } catch (error) {
    openCircuit()
    throw error
  }
}
