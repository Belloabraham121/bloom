import { NextResponse } from "next/server";
import { requirePrivyUser } from "@/server/lib/auth";
import { getActiveDemoSession, getDemoSessionService, resetDemoBalancesService } from "@/server/services/demo/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const session = sessionId
      ? await getDemoSessionService(sessionId, user.id)
      : await getActiveDemoSession(user.id, url.searchParams.get("conversationId"));
    if (!session) {
      return NextResponse.json({ balances: null });
    }
    return NextResponse.json({ balances: session.balances });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load balances" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      conversationId?: string | null;
    };
    const session = await resetDemoBalancesService({
      userId: user.id,
      sessionId: body.sessionId,
      conversationId: body.conversationId ?? null,
    });
    return NextResponse.json({ balances: session.balances });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset balances" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
