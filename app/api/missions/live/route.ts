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
import { getLiveSession } from "@/server/services/market/live-session"
import { listMissionsForUser } from "@/server/services/missions/repo"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUserFromRequest(request)
    const session = await getLiveSession(user.id)
    let running: Awaited<ReturnType<typeof listMissionsForUser>> = []
    try {
      const missions = await listMissionsForUser(user.id, 10)
      running = missions.filter((m) => m.status === "running")
    } catch {
      running = []
    }

    // Allow SSE if session OR a running mission (works across instances via DB)
    if (!session && running.length === 0) {
      return NextResponse.json(
        { error: "No live session. Ask the agent to start real-time data first." },
        { status: 404 }
      )
    }

    const url = new URL(request.url)
    const paramChain = Number(url.searchParams.get("chainId") || 0)
    const missionChain = Number(
      (running[0]?.params as { chainId?: number } | null)?.chainId || 0
    )
    const chainId = paramChain || session?.chainId || missionChain || 1

    const encoder = new TextEncoder()
    let cleanup: (() => Promise<void>) | null = null
    let closed = false

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
        const pollTimer = setInterval(() => {
          void pollMarketOnce(pollOpts).catch(() => {})
        }, 8_000)

        const heartbeat = setInterval(() => {
          if (closed) return
          controller.enqueue(encoder.encode(`: ping\n\n`))
        }, 15_000)

        const abort = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          clearInterval(pollTimer)
          void cleanup?.()
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }

        request.signal.addEventListener("abort", abort)
      },
      async cancel() {
        closed = true
        await cleanup?.()
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
