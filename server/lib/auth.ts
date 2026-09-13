import { PrivyClient } from "@privy-io/server-auth"
import { eq } from "drizzle-orm"
import { createHash } from "crypto"
import { db } from "@/server/services/db/client"
import { users, wallets } from "@/server/services/db/schema"
import type { AgentMode } from "@/lib/types"

export type AuthUser = {
  id: string
  privyUserId: string
  email: string | null
  agentMode: AgentMode
}

type CachedAuth = {
  user: AuthUser
  expiresAt: number
}

const tokenCache = new Map<string, CachedAuth>()
const userCache = new Map<string, { user: AuthUser; expiresAt: number }>()

const MAX_CACHE_SIZE = 10_000

function evictOldest(cache: Map<string, unknown>) {
  if (cache.size <= MAX_CACHE_SIZE) return
  const first = cache.keys().next().value
  if (first) cache.delete(first)
}
function getPrivy() {
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("Privy server credentials are not configured")
  }
  return new PrivyClient(appId, appSecret)
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  return authHeader.slice(7)
}

function tokenKey(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function readTokenCache(token: string): AuthUser | null {
  const entry = tokenCache.get(tokenKey(token))
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    tokenCache.delete(tokenKey(token))
    return null
  }
  return entry.user
}

function writeTokenCache(token: string, user: AuthUser, expSec?: number) {
  const now = Date.now()
  const fromExp = expSec ? expSec * 1000 : now + 5 * 60_000
  // Cap cache at 10 minutes; refresh before Privy exp when possible
  const expiresAt = Math.min(fromExp - 5_000, now + 10 * 60_000)
  if (expiresAt <= now) return
  tokenCache.set(tokenKey(token), { user, expiresAt })
  evictOldest(tokenCache)
  userCache.set(user.privyUserId, { user, expiresAt: now + 60_000 })
  evictOldest(userCache)
}

function isTimeoutError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: number | string })?.code
  return (
    code === 23 ||
    msg.includes("TimeoutError") ||
    msg.includes("aborted due to timeout") ||
    msg.includes("TIMEOUT")
  )
}

async function verifyTokenWithRetry(token: string) {
  const privy = getPrivy()
  try {
    return await privy.verifyAuthToken(token)
  } catch (error) {
    if (!isTimeoutError(error)) throw error
    // One retry — Privy JWKS / auth API often flakes on bad DNS
    await new Promise((r) => setTimeout(r, 300))
    return await privy.verifyAuthToken(token)
  }
}

async function resolveDbUser(privyUserId: string): Promise<AuthUser> {
  const cached = userCache.get(privyUserId)
  if (cached && cached.expiresAt > Date.now()) return cached.user

  const existing = await db.query.users.findFirst({
    where: eq(users.privyUserId, privyUserId),
  })

  if (existing) {
    const user: AuthUser = {
      id: existing.id,
      privyUserId: existing.privyUserId,
      email: existing.email,
      agentMode: (existing.agentMode as AgentMode) || "human_mediated",
    }
    userCache.set(privyUserId, { user, expiresAt: Date.now() + 60_000 })
    return user
  }

  const [created] = await db
    .insert(users)
    .values({
      privyUserId,
      agentMode: "human_mediated",
    })
    .onConflictDoNothing()
    .returning()

  if (!created) {
    // Race: another request created it first — re-fetch
    const retried = await db.query.users.findFirst({
      where: eq(users.privyUserId, privyUserId),
    })
    if (!retried) throw new Error("Failed to create user")
    const user: AuthUser = {
      id: retried.id,
      privyUserId: retried.privyUserId,
      email: retried.email,
      agentMode: (retried.agentMode as AgentMode) || "human_mediated",
    }
    userCache.set(privyUserId, { user, expiresAt: Date.now() + 60_000 })
    return user
  }

  const user: AuthUser = {
    id: created.id,
    privyUserId: created.privyUserId,
    email: created.email,
    agentMode: "human_mediated",
  }
  userCache.set(privyUserId, { user, expiresAt: Date.now() + 60_000 })
  return user
}

export async function requirePrivyUser(request: Request): Promise<AuthUser> {
  const token = extractBearerToken(request)
  if (!token) {
    throw Object.assign(new Error("Missing bearer token"), { status: 401 })
  }

  const cached = readTokenCache(token)
  if (cached) return cached

  let claims: { userId: string; expiration?: number }
  try {
    claims = await verifyTokenWithRetry(token)
  } catch (error) {
    if (isTimeoutError(error)) {
      throw Object.assign(
        new Error(
          "Privy auth timed out — check network/DNS reachability to auth.privy.io"
        ),
        { status: 503 }
      )
    }
    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Unauthorized"),
      { status: 401 }
    )
  }

  const user = await resolveDbUser(claims.userId)
  writeTokenCache(token, user, claims.expiration)
  return user
}

/** Verify a raw access token (Bearer or query). Used by SSE. */
export async function requirePrivyUserFromToken(token: string): Promise<AuthUser> {
  const cached = readTokenCache(token)
  if (cached) return cached

  let claims: { userId: string; expiration?: number }
  try {
    claims = await verifyTokenWithRetry(token)
  } catch (error) {
    if (isTimeoutError(error)) {
      throw Object.assign(
        new Error(
          "Privy auth timed out — check network/DNS reachability to auth.privy.io"
        ),
        { status: 503 }
      )
    }
    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Unauthorized"),
      { status: 401 }
    )
  }

  const user = await resolveDbUser(claims.userId)
  writeTokenCache(token, user, claims.expiration)
  return user
}

export async function upsertUserWallet(params: {
  userId: string
  address: string
  privyWalletId?: string | null
  email?: string | null
}) {
  if (params.email) {
    await db
      .update(users)
      .set({ email: params.email, updatedAt: new Date() })
      .where(eq(users.id, params.userId))
  }

  const existing = await db.query.wallets.findFirst({
    where: eq(wallets.userId, params.userId),
  })

  if (existing && existing.address.toLowerCase() === params.address.toLowerCase()) {
    return existing
  }

  const [wallet] = await db
    .insert(wallets)
    .values({
      userId: params.userId,
      address: params.address,
      privyWalletId: params.privyWalletId ?? null,
      isEmbedded: true,
      chainFamily: "ethereum",
    })
    .onConflictDoNothing()
    .returning()

  return wallet
}

export async function updateAgentMode(userId: string, agentMode: AgentMode) {
  const [updated] = await db
    .update(users)
    .set({ agentMode, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()
  return updated
}
