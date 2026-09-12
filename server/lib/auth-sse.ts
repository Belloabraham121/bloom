/**
 * Auth helper that accepts Bearer header or ?access_token= for EventSource.
 */

import { PrivyClient } from "@privy-io/server-auth"
import { eq } from "drizzle-orm"
import { db } from "@/server/services/db/client"
import { users } from "@/server/services/db/schema"
import type { AgentMode } from "@/lib/types"
import type { AuthUser } from "@/server/lib/auth"
import { extractBearerToken, requirePrivyUser } from "@/server/lib/auth"

function getPrivy() {
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("Privy server credentials are not configured")
  }
  return new PrivyClient(appId, appSecret)
}

export async function requirePrivyUserFromRequest(
  request: Request
): Promise<AuthUser> {
  const url = new URL(request.url)
  const queryToken = url.searchParams.get("access_token")
  if (!extractBearerToken(request) && queryToken) {
    const privy = getPrivy()
    const claims = await privy.verifyAuthToken(queryToken)
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
      .values({ privyUserId: claims.userId, agentMode: "human_mediated" })
      .returning()
    return {
      id: created.id,
      privyUserId: created.privyUserId,
      email: created.email,
      agentMode: "human_mediated",
    }
  }
  return requirePrivyUser(request)
}
