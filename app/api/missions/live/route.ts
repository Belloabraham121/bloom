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

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUserFromRequest(request)
    const session = await getLiveSession(user.id)
    if (!session) {
      return NextResponse.json(
        { error: "No live session. Ask the agent to start real-time data first." },
        { status: 404 }
      )
    }

    const url = new URL(request.url)
    const chainId = Number(
      url.searchParams.get("chainId") || session.chainId || 1
    )

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

        const heartbeat = setInterval(() => {
          if (closed) return
          controller.enqueue(encoder.encode(`: ping\n\n`))
        }, 15_000)

        const abort = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
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
