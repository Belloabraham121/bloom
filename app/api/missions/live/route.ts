import { NextResponse } from "next/server"
import { requirePrivyUserFromRequest } from "@/server/lib/auth-sse"
import {
  agentChannel,
  getRecentAgentEvents,
  marketChannel,
  getRecentMarketEvents,
  subscribeChannels,
  type BusMessage,
} from "@/server/services/market/bus"
import {
  getLiveSession,
  startLiveSession,
} from "@/server/services/market/live-session"
import { listMissionsForUser } from "@/server/services/missions/repo"
import { getCanvasModel } from "@/server/services/canvas/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUserFromRequest(request)
    let session = await getLiveSession(user.id)
    let running: Awaited<ReturnType<typeof listMissionsForUser>> = []
    try {
      const missions = await listMissionsForUser(user.id, 10)
      running = missions.filter((m) => m.status === "running")
    } catch {
      running = []
    }

    // Canvas _live.active survives across workers when Redis session was lost
    const url = new URL(request.url)
    const conversationId = url.searchParams.get("conversationId")
    if (!session && running.length === 0) {
      try {
        const canvas = await getCanvasModel(user.id, conversationId)
        const live = canvas.widgets?._live?.props as
          | {
              active?: boolean
              paused?: boolean
              chainId?: number
              missionId?: string | null
              symbol0?: string
              symbol1?: string
              purpose?: string
            }
          | undefined
        if (live?.active) {
          session = await startLiveSession({
            userId: user.id,
            conversationId,
            chainId: live.chainId || 1,
            purpose: live.purpose || "market_watch",
            missionId: live.missionId ?? null,
            symbol0: live.symbol0 || "USDC",
            symbol1: live.symbol1 || "ETH",
            paused: Boolean(live.paused),
            startedAt: new Date().toISOString(),
          })
        }
      } catch {
        /* ignore canvas heal */
      }
    }

    if (!session && running.length === 0) {
      // Must not return HTTP 404 — EventSource reconnects forever on non-2xx
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "session_gone" })}\n\n`
            )
          )
          controller.close()
        },
      })
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      })
    }

    const paramChain = Number(url.searchParams.get("chainId") || 0)
    const missionChain = Number(
      (running[0]?.params as { chainId?: number } | null)?.chainId || 0
    )
    const chainId = paramChain || session?.chainId || missionChain || 1

    const encoder = new TextEncoder()
    let cleanup: (() => Promise<void>) | null = null
    let closed = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let tornDown = false

    const stream = new ReadableStream({
      async start(controller) {
        const send = (msg: BusMessage) => {
          if (closed) return
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
        }

        const recentAgent = await getRecentAgentEvents(user.id, 20)
        for (const m of recentAgent.reverse()) send(m)
        const recentMarket = await getRecentMarketEvents(chainId, 10)
        for (const m of recentMarket.reverse()) send(m)

        cleanup = await subscribeChannels(
          [agentChannel(user.id), marketChannel(chainId)],
          (_ch, message) => send(message)
        )

        // Keep ticks flowing even if background ingest died (serverless)
        const { pollMarketOnce } = await import(
          "@/server/services/substreams/poller"
        )
        const symbol0 =
          session?.symbol0 ||
          (running[0]?.params as { symbol0?: string } | null)?.symbol0 ||
          "USDC"
        const symbol1 =
          session?.symbol1 ||
          (running[0]?.params as { symbol1?: string } | null)?.symbol1 ||
          "ETH"
        const pollOpts = {
          chainId,
          symbol0,
          symbol1,
          userId: user.id,
        }
        void pollMarketOnce(pollOpts).catch(() => {})
        // Single slow poller — burst+per-SSE pollers stacked and froze the client
        pollTimer = setInterval(() => {
          void pollMarketOnce(pollOpts).catch(() => {})
        }, 8_000)

        heartbeatTimer = setInterval(() => {
          if (closed) return
          controller.enqueue(encoder.encode(`: ping\n\n`))
        }, 15_000)

        const teardown = () => {
          if (tornDown) return
          tornDown = true
          closed = true
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          if (pollTimer) clearInterval(pollTimer)
          heartbeatTimer = null
          pollTimer = null
          void cleanup?.()
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }

        request.signal.addEventListener("abort", teardown)
      },
      cancel() {
        if (tornDown) return
        tornDown = true
        closed = true
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (pollTimer) clearInterval(pollTimer)
        heartbeatTimer = null
        pollTimer = null
        void cleanup?.()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status }
    )
  }
}
