import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import { runChatTurnAsResponse } from "@/server/services/agent/agent.service"

type ChatMessage = {
  role: "user" | "assistant"
  content: string
  imageData?: string
}

export async function handleChatPost(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const body = await request.json()
    const messages = (body.messages ?? []) as ChatMessage[]
    const model = (body.model as string) || "openai/gpt-4o"
    const conversationId = (body.conversationId as string) || null

    if (!messages.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 })
    }

    return await runChatTurnAsResponse({
      userId: user.id,
      decisionOrigin: user.agentMode,
      conversationId,
      model,
      messages,
    })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    console.error("Chat API error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chat failed",
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
