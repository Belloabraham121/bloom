import { PrivyClient } from "@privy-io/server-auth"
import { eq } from "drizzle-orm"
import { db } from "@/server/services/db/client"
import { users, wallets } from "@/server/services/db/schema"
import type { AgentMode } from "@/lib/types"

export type AuthUser = {
  id: string
  privyUserId: string
  email: string | null
  agentMode: AgentMode
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

export async function requirePrivyUser(request: Request): Promise<AuthUser> {
  const token = extractBearerToken(request)
  if (!token) {
    throw Object.assign(new Error("Missing bearer token"), { status: 401 })
  }

  const privy = getPrivy()
  const claims = await privy.verifyAuthToken(token)

  const existing = await db.query.users.findFirst({
    where: eq(users.privyUserId, claims.userId),
  })

  if (existing) {
    return {
      id: existing.id,
      privyUserId: existing.privyUserId,
      email: existing.email,
      agentMode: (existing.agentMode as AgentMode) || "human_mediated",
    }
  }

  const [created] = await db
    .insert(users)
    .values({
      privyUserId: claims.userId,
      agentMode: "human_mediated",
    })
    .returning()

  return {
    id: created.id,
    privyUserId: created.privyUserId,
    email: created.email,
    agentMode: "human_mediated",
  }
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
