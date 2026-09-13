import { NextResponse } from "next/server";
import { requirePrivyUser } from "@/server/lib/auth";
import { getActiveDemoSession, getDemoSessionService } from "@/server/services/demo/store";
import { addDemoPanelService } from "@/server/services/demo/canvas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      conversationId?: string | null;
      kind?: "graph" | "swap" | "liquidity" | "balances" | "tape";
      feedId?: string;
      side?: "buy" | "sell";
      amount?: string;
      usdcAmount?: string;
    };
    if (!body.kind) {
      return NextResponse.json({ error: "kind is required" }, { status: 400 });
    }
    const conversationId = body.conversationId ?? null;
    const session = body.sessionId
      ? await getDemoSessionService(body.sessionId, user.id)
      : await getActiveDemoSession(user.id, conversationId);
    if (!session) {
      return NextResponse.json({ error: "Start the session before adding panels" }, { status: 404 });
    }
    const panel = await addDemoPanelService({
      userId: user.id,
      conversationId,
      session,
      kind: body.kind,
      feedId: body.feedId,
      side: body.side,
      amount: body.amount,
      usdcAmount: body.usdcAmount,
    });
    const updated = body.sessionId
      ? await getDemoSessionService(body.sessionId, user.id)
      : await getActiveDemoSession(user.id, conversationId);
    return NextResponse.json({ panel, session: updated });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add panel" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
