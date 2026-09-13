/**
 * Auth helper that accepts Bearer header, ?ticket= (preferred), or ?access_token= for EventSource.
 * Prefer ticket-based auth — tickets are single-use, short-lived, and don't leak long-lived tokens in URLs.
 */

import type { AuthUser } from "@/server/lib/auth"
import {
  extractBearerToken,
  requirePrivyUser,
  requirePrivyUserFromToken,
} from "@/server/lib/auth"
import { redeemTicket } from "@/server/lib/sse-ticket"

export async function requirePrivyUserFromRequest(
  request: Request
): Promise<AuthUser> {
  const url = new URL(request.url)

  // Prefer single-use SSE ticket (no long-lived token in URL)
  const ticket = url.searchParams.get("ticket")
  if (ticket) {
    const user = redeemTicket(ticket)
    if (user) return user
    throw Object.assign(new Error("Invalid or expired SSE ticket"), { status: 401 })
  }

  // Fallback: Bearer header
  if (extractBearerToken(request)) {
    return requirePrivyUser(request)
  }

  // Legacy fallback: query string access_token (deprecated)
  const queryToken = url.searchParams.get("access_token")
  if (queryToken) {
    return requirePrivyUserFromToken(queryToken)
  }

  throw Object.assign(new Error("Missing authentication"), { status: 401 })
}
