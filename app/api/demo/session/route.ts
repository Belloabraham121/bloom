import { NextResponse } from "next/server";
import { requirePrivyUser } from "@/server/lib/auth";
import { createDemoSessionService, getActiveDemoSession } from "@/server/services/demo/store";
import { seedDemoDashboards } from "@/server/services/demo/canvas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const url = new URL(request.url);
    const session = await getActiveDemoSession(user.id, url.searchParams.get("conversationId"));
    if (!session) {
      return NextResponse.json({ session: null });
    }
    return NextResponse.json({ session });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load session" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: string | null;
      feeds?: Array<{
        feedId?: string;
        chainId?: number;
        symbol0?: string;
        symbol1?: string;
        tickMs?: number;
      }>;
      reset?: boolean;
    };
    const conversationId = body.conversationId ?? null;
    const session = await createDemoSessionService({
      userId: user.id,
      conversationId,
      feeds: body.feeds,
      reset: body.reset,
    });
    await seedDemoDashboards({ userId: user.id, conversationId, session });
    return NextResponse.json({ session });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start session" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
