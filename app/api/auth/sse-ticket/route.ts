import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { issueTicket } from "@/server/lib/sse-ticket"

/**
 * POST /api/auth/sse-ticket — mint a short-lived single-use ticket
 * for EventSource connections (avoids long-lived tokens in query strings).
 */
export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const ticket = issueTicket(user)
    return NextResponse.json({ ticket })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status }
    )
  }
}
