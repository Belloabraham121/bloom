/**
 * Redis client for market bus, agent events, and mission cursors.
 */

import Redis from "ioredis"

const globalForRedis = globalThis as unknown as {
  bloomRedis?: Redis
  bloomRedisSub?: Redis
}

function redisUrl() {
  return process.env.REDIS_URL || "redis://localhost:6380"
}

export function getRedis(): Redis {
  if (!globalForRedis.bloomRedis) {
    globalForRedis.bloomRedis = new Redis(redisUrl(), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  }
  return globalForRedis.bloomRedis
}

/** Dedicated subscriber connection (ioredis requires separate conn for SUBSCRIBE). */
export function getRedisSubscriber(): Redis {
  if (!globalForRedis.bloomRedisSub) {
    globalForRedis.bloomRedisSub = new Redis(redisUrl(), {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  }
  return globalForRedis.bloomRedisSub
}

export async function ensureRedisConnected(client: Redis = getRedis()) {
  if (client.status === "wait" || client.status === "close") {
    await client.connect()
  }
}
