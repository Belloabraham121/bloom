/**
 * Auth helper that accepts Bearer header or ?access_token= for EventSource.
 */

import type { AuthUser } from "@/server/lib/auth"
import {
  extractBearerToken,
  requirePrivyUser,
  requirePrivyUserFromToken,
} from "@/server/lib/auth"

export async function requirePrivyUserFromRequest(
  request: Request
): Promise<AuthUser> {
  const url = new URL(request.url)
  const queryToken = url.searchParams.get("access_token")
  if (!extractBearerToken(request) && queryToken) {
    return requirePrivyUserFromToken(queryToken)
  }
  return requirePrivyUser(request)
}
