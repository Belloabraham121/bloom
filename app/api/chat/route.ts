import { handleChatPost } from "@/server/controllers/chat.controller"

export const maxDuration = 60

export async function POST(request: Request) {
  return handleChatPost(request)
}
