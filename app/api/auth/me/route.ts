import { PrivyClient } from "@privy-io/server-auth"
import { NextResponse } from "next/server"

/**
 * Verify a Privy access token from the Authorization header.
 * Used by protected API routes when you need a server-side identity check.
 */
export async function GET(request: Request) {
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Privy server credentials are not configured" },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null

  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 })
  }

  try {
    const privy = new PrivyClient(appId, appSecret)
    const claims = await privy.verifyAuthToken(token)
    return NextResponse.json({
      userId: claims.userId,
      sessionId: claims.sessionId,
      appId: claims.appId,
    })
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }
}
