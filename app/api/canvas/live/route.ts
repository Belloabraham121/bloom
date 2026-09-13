import { NextResponse } from "next/server"
import { requirePrivyUserFromRequest } from "@/server/lib/auth-sse"
import {
  agentChannel,
  getRecentAgentEvents,
  subscribeChannels,
  type BusMessage,
  type CanvasPatch,
} from "@/server/services/market/bus"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Always-on SSE for incremental canvas patches (no live market session required).
 */
export async function GET(request: Request) {
  try {
    const user = await requirePrivyUserFromRequest(request)
    const url = new URL(request.url)
    const conversationId = url.searchParams.get("conversationId")

    const encoder = new TextEncoder()
    let cleanup: (() => Promise<void>) | null = null
    let closed = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let tornDown = false

    const matchesConversation = (msg: CanvasPatch) => {
      if (!conversationId) return true
      const cid = msg.conversationId ?? null
      return cid === conversationId || cid === null
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (msg: BusMessage) => {
          if (closed) return
          if (msg.type !== "canvas_patch") return
          if (!matchesConversation(msg)) return
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
        }

        const recent = await getRecentAgentEvents(user.id, 8)
        for (const m of recent.reverse()) {
          if (m.type === "canvas_patch") send(m)
        }

        cleanup = await subscribeChannels([agentChannel(user.id)], (_ch, message) =>
          send(message)
        )

        heartbeatTimer = setInterval(() => {
          if (closed) return
          controller.enqueue(encoder.encode(`: ping\n\n`))
        }, 15_000)

        const teardown = () => {
          if (tornDown) return
          tornDown = true
          closed = true
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          heartbeatTimer = null
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
        heartbeatTimer = null
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
