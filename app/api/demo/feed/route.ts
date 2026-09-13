import { NextResponse } from "next/server";
import { requirePrivyUser } from "@/server/lib/auth";
import { updateDemoFeedService } from "@/server/services/demo/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      conversationId?: string | null;
      feedId?: string;
      action?: "pause" | "resume";
      tickMs?: number;
    };
    if (!body.feedId || !body.action) {
      return NextResponse.json({ error: "feedId and action are required" }, { status: 400 });
    }
    const session = await updateDemoFeedService({
      userId: user.id,
      sessionId: body.sessionId,
      conversationId: body.conversationId ?? null,
      feedId: body.feedId,
      action: body.action,
      tickMs: body.tickMs,
    });
    return NextResponse.json({ session });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update feed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
