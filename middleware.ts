import { NextResponse, type NextRequest } from "next/server"

/**
 * In-memory sliding-window rate limiter for API routes.
 * Per-IP, resets every WINDOW_MS. Not shared across workers —
 * use Redis rate limiting in production for distributed enforcement.
 */
const WINDOW_MS = 60_000
const MAX_REQUESTS = 120
const MAX_REQUESTS_WRITE = 40

const windows = new Map<string, { count: number; expiresAt: number }>()

function evictStale() {
  const now = Date.now()
  if (windows.size < 5_000) return
  for (const [key, entry] of windows) {
    if (entry.expiresAt <= now) windows.delete(key)
  }
}

function isRateLimited(ip: string, isWrite: boolean): boolean {
  evictStale()
  const now = Date.now()
  const key = `${ip}:${isWrite ? "w" : "r"}`
  const limit = isWrite ? MAX_REQUESTS_WRITE : MAX_REQUESTS
  const entry = windows.get(key)

  if (!entry || entry.expiresAt <= now) {
    windows.set(key, { count: 1, expiresAt: now + WINDOW_MS })
    return false
  }

  entry.count++
  return entry.count > limit
}

const RATE_LIMITED_PATHS = /^\/api\/(chat|wallet|missions|canvas|users|workflow|parse-pdf)/

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!RATE_LIMITED_PATHS.test(pathname)) {
    return NextResponse.next()
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"

  const isWrite = request.method !== "GET" && request.method !== "HEAD"

  if (isRateLimited(ip, isWrite)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
        },
      }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
