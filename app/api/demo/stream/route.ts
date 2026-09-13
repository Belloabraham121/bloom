import { NextResponse } from "next/server";
import { requirePrivyUserFromRequest } from "@/server/lib/auth-sse";
import {
  ensureDemoSessionStreaming,
  getDemoSessionService,
  subscribeDemoSession,
} from "@/server/services/demo/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUserFromRequest(request);
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    const session = await ensureDemoSessionStreaming(sessionId, user.id);
    const encoder = new TextEncoder();
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const send = (payload: unknown) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        void getDemoSessionService(session.id, user.id)
          .then((snapshot) => {
            send({ type: "demo_snapshot", session: snapshot, at: new Date().toISOString() });
          })
          .catch(() => {
            send({ type: "demo_error", error: "Paper snapshot unavailable", at: new Date().toISOString() });
          });
        unsubscribe = subscribeDemoSession(session.id, (event) => send(event));
        heartbeat = setInterval(() => {
          if (closed) return;
          controller.enqueue(encoder.encode(`: ping\n\n`));
        }, 15_000);
        request.signal.addEventListener("abort", () => {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
      cancel() {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status }
    );
  }
}

