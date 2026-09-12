import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import {
  getCanvasModel,
  patchCanvasForUser,
} from "@/server/services/canvas/store"
import type { CanvasPatchOp } from "@/server/services/canvas/model"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const url = new URL(request.url)
    const conversationId = url.searchParams.get("conversationId")
    const model = await getCanvasModel(user.id, conversationId)
    return NextResponse.json({ canvas: model })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const body = (await request.json()) as {
      conversationId?: string | null
      patch: CanvasPatchOp
    }
    if (!body.patch?.op) {
      return NextResponse.json({ error: "patch.op required" }, { status: 400 })
    }
    const canvas = await patchCanvasForUser({
      userId: user.id,
      conversationId: body.conversationId,
      patch: body.patch,
    })
    return NextResponse.json({ canvas })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status }
    )
  }
}
