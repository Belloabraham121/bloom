"use client"

import { useEffect, useState, useCallback, useRef, useMemo, type MutableRefObject } from "react"
import { MessageSquare } from "lucide-react"
import { AgentCanvas } from "./agent-canvas"
import { ChatTranscript } from "./chat-transcript"
import { Composer, type AIModel } from "./composer"
import { ConversationsSidebar } from "./conversations-sidebar"
import { SettingsPopover } from "./settings-popover"
import { LiveFeedBridge } from "./live-feed-bridge"
import { useLiveFeed, useCanvasFeed } from "./live-feed-context"
import { Button } from "@/components/ui/button"
import { TransactionHub } from "./transaction-hub"
import { usePrivy } from "@privy-io/react-auth"
import Image from "next/image"
import Link from "next/link"
import {
  type Conversation,
  type ConversationMessage,
  createConversation,
  deleteConversation,
  generateId,
  getActiveConversationId,
  loadConversations,
  MODEL_STORAGE_KEY,
  saveConversations,
  setActiveConversationId,
  upsertConversation,
} from "@/lib/conversations"
import { shortenAddress } from "@/lib/privy-wallet"
import type { ActionEvent } from "@openuidev/react-lang"
import { BuiltinActionType } from "@openuidev/react-lang"
import { parseLiveMarketControl } from "@/lib/openui/detect"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
  imageData?: string
}

function toMessages(stored: ConversationMessage[]): Message[] {
  return stored.map((msg) => ({
    ...msg,
    createdAt: new Date(msg.createdAt),
  }))
}

function toStored(messages: Message[]): ConversationMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
    imageData: msg.imageData,
  }))
}

interface ChatShellProps {
  userEmail: string
  userName?: string | null
  walletAddress?: string
}

export function ChatShell({ userEmail, userName, walletAddress }: ChatShellProps) {
  const { logout, getAccessToken } = usePrivy()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [selectedModel, setSelectedModel] = useState<AIModel>("openai/gpt-4o")
  const [isLoaded, setIsLoaded] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [walletBalanceLabel, setWalletBalanceLabel] = useState<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  const activeIdRef = useRef<string | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    if (!walletAddress) {
      setWalletBalanceLabel(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const res = await fetch(
          `/api/wallet/balance?chainId=1&address=${encodeURIComponent(walletAddress)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        const parts = [data.nativeDisplay, data.usdcDisplay].filter(Boolean)
        setWalletBalanceLabel(parts.join(" · ") || null)
      } catch {
        if (!cancelled) setWalletBalanceLabel(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [walletAddress, getAccessToken])

  useEffect(() => {
    try {
      let loaded = loadConversations()
      let active = getActiveConversationId()

      // Migrate legacy single-thread storage if present
      if (loaded.length === 0) {
        const legacy = localStorage.getItem("chat-messages")
        if (legacy) {
          const parsed = JSON.parse(legacy) as ConversationMessage[]
          if (Array.isArray(parsed) && parsed.length > 0) {
            const migrated = createConversation()
            migrated.messages = parsed
            migrated.title =
              parsed.find((m) => m.role === "user")?.content.slice(0, 42) ||
              "Imported chat"
            loaded = [migrated]
            active = migrated.id
            saveConversations(loaded)
            setActiveConversationId(migrated.id)
            localStorage.removeItem("chat-messages")
          }
        }
      }

      if (loaded.length === 0) {
        const fresh = createConversation()
        loaded = [fresh]
        active = fresh.id
        saveConversations(loaded)
        setActiveConversationId(fresh.id)
      }

      if (!active || !loaded.some((c) => c.id === active)) {
        active = loaded[0].id
        setActiveConversationId(active)
      }

      setConversations(loaded)
      setActiveId(active)
      const current = loaded.find((c) => c.id === active) || loaded[0]
      setMessages(toMessages(current.messages))

      const savedModel = localStorage.getItem(MODEL_STORAGE_KEY) as AIModel | null
      if (savedModel) setSelectedModel(savedModel)
    } catch (e) {
      console.error("Failed to load conversations:", e)
      const fresh = createConversation()
      setConversations([fresh])
      setActiveId(fresh.id)
      setMessages([])
    } finally {
      setIsLoaded(true)
    }
  }, [])

  const persistActive = useCallback((nextMessages: Message[], conversationId: string) => {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === conversationId) || createConversation()
      const updated: Conversation = {
        ...existing,
        id: conversationId,
        messages: toStored(nextMessages),
      }
      const next = upsertConversation(prev, updated)
      saveConversations(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!isLoaded || !activeId) return
    persistActive(messages, activeId)
  }, [messages, activeId, isLoaded, persistActive])

  const handleModelChange = useCallback((model: AIModel) => {
    setSelectedModel(model)
    localStorage.setItem(MODEL_STORAGE_KEY, model)
  }, [])

  const switchConversation = useCallback((id: string) => {
    const currentId = activeIdRef.current
    const currentMessages = messagesRef.current

    setConversations((prev) => {
      let next = prev
      if (currentId) {
        const existing = prev.find((c) => c.id === currentId) || {
          ...createConversation(),
          id: currentId,
        }
        next = upsertConversation(prev, {
          ...existing,
          messages: toStored(currentMessages),
        })
      }

      const target = next.find((c) => c.id === id)
      if (target) {
        setActiveId(id)
        setActiveConversationId(id)
        setMessages(toMessages(target.messages))
        setError(null)
      }
      saveConversations(next)
      return next
    })
  }, [])

  const handleNewConversation = useCallback(() => {
    const currentId = activeIdRef.current
    const currentMessages = messagesRef.current
    const fresh = createConversation()

    setConversations((prev) => {
      let next = prev
      if (currentId) {
        const existing = prev.find((c) => c.id === currentId) || {
          ...createConversation(),
          id: currentId,
        }
        next = upsertConversation(prev, {
          ...existing,
          messages: toStored(currentMessages),
        })
      }
      next = [fresh, ...next.filter((c) => c.id !== fresh.id)]
      saveConversations(next)
      return next
    })
    setActiveId(fresh.id)
    setActiveConversationId(fresh.id)
    setMessages([])
    setError(null)
    setSidebarOpen(false)
  }, [])

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = deleteConversation(prev, id)
        if (next.length === 0) {
          const fresh = createConversation()
          saveConversations([fresh])
          setActiveId(fresh.id)
          setActiveConversationId(fresh.id)
          setMessages([])
          return [fresh]
        }
        saveConversations(next)
        if (activeIdRef.current === id) {
          setActiveId(next[0].id)
          setActiveConversationId(next[0].id)
          setMessages(toMessages(next[0].messages))
        }
        return next
      })
      setError(null)
    },
    []
  )

  const sendMessage = useCallback(
    async (content: string, imageData?: string) => {
      if ((!content.trim() && !imageData) || isStreaming) return

      setError(null)

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim() || "Describe this image",
        createdAt: new Date(),
        imageData,
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
      }

      const history = [...messagesRef.current, userMessage]
      setMessages([...history, assistantMessage])
      setIsStreaming(true)

      const controller = new AbortController()
      setAbortController(controller)

      try {
        const token = await getAccessToken()
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
              imageData: m.imageData,
            })),
            model: selectedModel,
            conversationId: activeIdRef.current,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || `HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error("No response body")
        }

        let accumulatedContent = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          accumulatedContent += chunk

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, content: accumulatedContent }
                : msg
            )
          )
        }

        if (!accumulatedContent.trim()) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? {
                    ...msg,
                    content:
                      "No response received from the assistant. Please try again.",
                  }
                : msg
            )
          )
        }      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, content: msg.content || "[Cancelled]" }
                : msg
            )
          )
        } else {
          console.error("Error sending message:", e)
          setError(e instanceof Error ? e.message : "An error occurred")
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id))
        }
      } finally {
        setIsStreaming(false)
        setAbortController(null)
      }
    },
    [isStreaming, selectedModel, getAccessToken]
  )

  const retry = useCallback(() => {
    if (messages.length === 0) return
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMessage) {
      const index = messages.findIndex((m) => m.id === lastUserMessage.id)
      setMessages(messages.slice(0, index))
      setError(null)
      setTimeout(() => sendMessage(lastUserMessage.content, lastUserMessage.imageData), 100)
    }
  }, [messages, sendMessage])

  const stopStreaming = useCallback(() => {
    abortController?.abort()
  }, [abortController])

  const handleLogout = async () => {
    await logout()
    window.location.href = "/auth"
  }

  const displayName = userName || userEmail.split("@")[0]
  const walletLabel = walletAddress ? shortenAddress(walletAddress) : null

  // Stable children identity: LiveFeedBridge re-renders on ticks without rebuilding chrome
  const board = useMemo(
    () => (
      <ChatShellBoard
        messages={messages}
        isStreaming={isStreaming}
        error={error}
        onRetry={retry}
        isLoaded={isLoaded}
        displayName={displayName}
        conversationKey={activeId}
        sendMessage={sendMessage}
        getAccessToken={getAccessToken}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        conversations={conversations}
        onSelectConversation={switchConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        userEmail={userEmail}
        walletLabel={walletLabel}
        walletAddress={walletAddress ?? null}
        walletBalanceLabel={walletBalanceLabel}
        onLogout={handleLogout}
        onStop={stopStreaming}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />
    ),
    [
      messages,
      isStreaming,
      error,
      retry,
      isLoaded,
      displayName,
      activeId,
      sendMessage,
      getAccessToken,
      sidebarOpen,
      conversations,
      switchConversation,
      handleNewConversation,
      handleDeleteConversation,
      userEmail,
      walletLabel,
      walletAddress,
      walletBalanceLabel,
      stopStreaming,
      selectedModel,
      handleModelChange,
    ]
  )

  return (
    <LiveFeedBridge
      conversationId={activeId}
      chainId={1}
      refreshKey={messages.length}
    >
      {board}
    </LiveFeedBridge>
  )
}

function ChatShellBoard({
  messages,
  isStreaming,
  error,
  onRetry,
  isLoaded,
  displayName,
  conversationKey,
  sendMessage,
  getAccessToken,
  sidebarOpen,
  setSidebarOpen,
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  userEmail,
  walletLabel,
  walletAddress,
  walletBalanceLabel,
  onLogout,
  onStop,
  selectedModel,
  onModelChange,
}: {
  messages: Message[]
  isStreaming: boolean
  error: string | null
  onRetry: () => void
  isLoaded: boolean
  displayName: string
  conversationKey: string | null
  sendMessage: (content: string, imageData?: string) => Promise<void>
  getAccessToken: () => Promise<string | null>
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  conversations: Conversation[]
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  userEmail: string
  walletLabel: string | null
  walletAddress: string | null
  walletBalanceLabel: string | null
  onLogout: () => void
  onStop: () => void
  selectedModel: AIModel
  onModelChange: (model: AIModel) => void
}) {
  // Refs keep OpenUI actions / effects off the market-tick render path
  const missionActionRef = useRef<
    (action: string, missionId?: string | null) => Promise<void>
  >(async () => {})
  const refreshLiveStatusRef = useRef<() => Promise<boolean>>(async () => false)

  const handleOpenUIAction = useCallback(
    (event: ActionEvent) => {
      if (event.type === BuiltinActionType.OpenUrl) {
        const url = event.params?.url
        if (typeof url === "string" && /^https?:\/\//i.test(url)) {
          window.open(url, "_blank", "noopener,noreferrer")
        }
        return
      }
      if (event.type === BuiltinActionType.ContinueConversation) {
        const text =
          (typeof event.humanFriendlyMessage === "string" &&
            event.humanFriendlyMessage.trim()) ||
          (typeof event.params?.context === "string" && event.params.context) ||
          ""
        if (!text) return
        const control = parseLiveMarketControl(text)
        if (control) {
          void missionActionRef.current(control)
          return
        }
        void sendMessage(text)
      }
    },
    [sendMessage]
  )

  return (
    <div className="relative h-dvh overflow-hidden bg-background">
      <LiveFeedRefSync
        missionActionRef={missionActionRef}
        refreshLiveStatusRef={refreshLiveStatusRef}
        isStreaming={isStreaming}
        conversationKey={conversationKey}
        getAccessToken={getAccessToken}
      />

      <ConversationsSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={conversationKey}
        onSelect={onSelectConversation}
        onNew={onNewConversation}
        onDelete={onDeleteConversation}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pt-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link href="/" className="flex items-center">
            <Image
              src="/images/flowforge.png"
              alt="FlowForge"
              width={36}
              height={36}
              className="rounded-lg"
            />
          </Link>
          <Button
            onClick={() => setSidebarOpen(true)}
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-muted/90 text-muted-foreground backdrop-blur-sm hover:bg-accent hover:text-foreground"
            aria-label="Open conversations"
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div className="hidden flex-col items-end sm:flex">
            <span className="max-w-[12rem] truncate text-xs text-muted-foreground">
              {userEmail}
            </span>
            {walletLabel && (
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {walletLabel}
              </span>
            )}
            {walletBalanceLabel && (
              <span className="text-[10px] text-muted-foreground">
                {walletBalanceLabel}
              </span>
            )}
          </div>
          <SettingsPopover
            email={userEmail}
            walletLabel={walletLabel}
            walletAddress={walletAddress}
            onLogout={onLogout}
          />
        </div>
      </div>

      <AgentCanvas
        messages={messages}
        isStreaming={isStreaming}
        error={error}
        onRetry={onRetry}
        isLoaded={isLoaded}
        username={displayName}
        onOpenUIAction={handleOpenUIAction}
        conversationKey={conversationKey}
        topOffsetClassName="pt-16"
        bottomOffsetClassName="pb-44 sm:pb-48"
      />

      <TransactionHub getAccessToken={getAccessToken} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 pb-4">
        <div className="pointer-events-none px-4">
          <ChatTranscript messages={messages} isStreaming={isStreaming} />
        </div>
        <Composer
          onSend={sendMessage}
          onStop={onStop}
          isStreaming={isStreaming}
          disabled={!!error}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          placement="bottom"
        />
      </div>
    </div>
  )
}

/** Tiny consumer — updates refs + effects without re-rendering the board chrome. */
function LiveFeedRefSync({
  missionActionRef,
  refreshLiveStatusRef,
  isStreaming,
  conversationKey,
  getAccessToken,
}: {
  missionActionRef: MutableRefObject<
    (action: string, missionId?: string | null) => Promise<void>
  >
  refreshLiveStatusRef: MutableRefObject<() => Promise<boolean>>
  isStreaming: boolean
  conversationKey: string | null
  getAccessToken: () => Promise<string | null>
}) {
  const { missionAction } = useLiveFeed()
  const { refreshLiveStatus } = useCanvasFeed()
  missionActionRef.current = missionAction
  refreshLiveStatusRef.current = refreshLiveStatus

  useEffect(() => {
    if (!isStreaming) void refreshLiveStatus()
  }, [isStreaming, refreshLiveStatus])

  useEffect(() => {
    const onConfirm = (ev: Event) => {
      const detail = (ev as CustomEvent<{ preparedJson?: string | null }>)
        .detail
      const raw = detail?.preparedJson
      if (!raw) return
      void (async () => {
        try {
          const prepared = JSON.parse(raw) as {
            chainId: number
            to: string
            data?: string
            value?: string
            category?: string
            tradeIntentId?: string
          }
          const token = await getAccessToken()
          if (!token) return
          await fetch("/api/wallet/execute", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...prepared,
              data: prepared.data || "0x",
              conversationId: conversationKey,
              requireAutonomous: false,
            }),
          })
          void refreshLiveStatusRef.current()
        } catch (e) {
          console.error("confirm-tx failed", e)
        }
      })()
    }
    window.addEventListener("bloom:confirm-tx", onConfirm)
    return () => window.removeEventListener("bloom:confirm-tx", onConfirm)
  }, [getAccessToken, conversationKey, refreshLiveStatusRef])

  return null
}
