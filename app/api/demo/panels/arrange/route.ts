import { NextResponse } from "next/server";
import { requirePrivyUser } from "@/server/lib/auth";
import { arrangeDemoPanelsService } from "@/server/services/demo/canvas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: string | null;
    };
    const result = await arrangeDemoPanelsService({
      userId: user.id,
      conversationId: body.conversationId ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to arrange panels" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
