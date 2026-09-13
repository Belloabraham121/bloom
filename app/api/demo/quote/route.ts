import { NextResponse } from "next/server";
import { requirePrivyUser } from "@/server/lib/auth";
import { quoteDemoService } from "@/server/services/demo/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      conversationId?: string | null;
      feedId?: string;
      side?: "buy" | "sell";
      amount?: string;
    };
    if (!body.feedId || !body.side || !body.amount) {
      return NextResponse.json({ error: "feedId, side, and amount are required" }, { status: 400 });
    }
    const quote = await quoteDemoService({
      userId: user.id,
      sessionId: body.sessionId,
      conversationId: body.conversationId ?? null,
      feedId: body.feedId,
      side: body.side,
      amount: body.amount,
    });
    return NextResponse.json({ quote });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quote" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
