/**
 * Short-lived SSE tickets to replace long-lived access tokens in query strings.
 * Tickets are single-use, expire after 30 seconds, and are stored in-memory.
 * For distributed deployments, replace with Redis-based storage.
 */

import { randomBytes } from "crypto"
import type { AuthUser } from "@/server/lib/auth"

type TicketEntry = {
  user: AuthUser
  expiresAt: number
}

const tickets = new Map<string, TicketEntry>()
const TICKET_TTL_MS = 30_000
const MAX_TICKETS = 10_000

function evictExpired() {
  if (tickets.size < MAX_TICKETS * 0.8) return
  const now = Date.now()
  for (const [key, entry] of tickets) {
    if (entry.expiresAt <= now) tickets.delete(key)
  }
}

/** Issue a single-use SSE ticket for an authenticated user. */
export function issueTicket(user: AuthUser): string {
  evictExpired()
  const ticket = randomBytes(32).toString("hex")
  tickets.set(ticket, {
    user,
    expiresAt: Date.now() + TICKET_TTL_MS,
  })
  return ticket
}

/** Redeem a ticket — single-use, deleted after first read. Returns null if expired or missing. */
export function redeemTicket(ticket: string): AuthUser | null {
  const entry = tickets.get(ticket)
  if (!entry) return null
  tickets.delete(ticket)
  if (entry.expiresAt <= Date.now()) return null
  return entry.user
}
