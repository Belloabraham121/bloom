export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  imageData?: string
}

export type Conversation = {
  id: string
  title: string
  messages: ConversationMessage[]
  updatedAt: string
  createdAt: string
}

const CONVERSATIONS_KEY = "bloom-conversations"
const ACTIVE_ID_KEY = "bloom-active-conversation"
const MODEL_STORAGE_KEY = "chat-selected-model"

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function titleFromMessages(messages: ConversationMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim())
  if (!firstUser) return "New conversation"
  const text = firstUser.content.trim().replace(/\s+/g, " ")
  return text.length > 42 ? `${text.slice(0, 42)}…` : text
}

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Conversation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
}

export function getActiveConversationId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(ACTIVE_ID_KEY)
}

export function setActiveConversationId(id: string) {
  localStorage.setItem(ACTIVE_ID_KEY, id)
}

export function createConversation(): Conversation {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    title: "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function upsertConversation(
  conversations: Conversation[],
  conversation: Conversation
): Conversation[] {
  const next = {
    ...conversation,
    title: titleFromMessages(conversation.messages),
    updatedAt: new Date().toISOString(),
  }
  const index = conversations.findIndex((c) => c.id === next.id)
  if (index === -1) return [next, ...conversations]
  const copy = [...conversations]
  copy[index] = next
  return copy.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export function deleteConversation(
  conversations: Conversation[],
  id: string
): Conversation[] {
  return conversations.filter((c) => c.id !== id)
}

export { MODEL_STORAGE_KEY }
