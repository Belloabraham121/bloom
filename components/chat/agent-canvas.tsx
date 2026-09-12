"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Renderer, type ActionEvent } from "@openuidev/react-lang"
import { ThemeProvider } from "@openuidev/react-ui/ThemeProvider"
import { bloomLibrary } from "@/lib/openui/bloom-library"
import { looksLikeOpenUI, resolveCanvasDocument } from "@/lib/openui/detect"
import type { Message } from "./chat-shell"
import { AnimatedOrb } from "./animated-orb"
import { CanvasRenderGlow } from "./canvas-render-glow"
import { TypingIndicator } from "./typing-indicator"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCanvasShell } from "./live-feed-context"

interface AgentCanvasProps {
  messages: Message[]
  isStreaming: boolean
  error: string | null
  onRetry: () => void
  isLoaded: boolean
  username?: string
  onOpenUIAction?: (event: ActionEvent) => void
  /** Reset held canvas when the active conversation changes */
  conversationKey?: string | null
  /** Persist shell OpenUI (with CanvasSlots) into canvas store */
  onShellDocument?: (openui: string) => void
  topOffsetClassName?: string
  bottomOffsetClassName?: string
}

export function AgentCanvas({
  messages,
  isStreaming,
  error,
  onRetry,
  isLoaded,
  username,
  onOpenUIAction,
  conversationKey = null,
  onShellDocument,
  topOffsetClassName = "pt-16",
  bottomOffsetClassName = "pb-44",
}: AgentCanvasProps) {
  const [hasAnimated, setHasAnimated] = useState(false)
  const hasPlayedIntroRef = useRef(false)
  const [heldCanvas, setHeldCanvas] = useState<{
    messageId: string
    content: string
  } | null>(null)
  const lastSyncedShellRef = useRef<string | null>(null)

  const canvasShell = useCanvasShell()
  const live = resolveCanvasDocument(messages, isStreaming)

  useEffect(() => {
    if (live) {
      setHeldCanvas({ messageId: live.messageId, content: live.content })
    }
  }, [live?.messageId, live?.content])

  useEffect(() => {
    setHeldCanvas(null)
    lastSyncedShellRef.current = null
  }, [conversationKey])

  useEffect(() => {
    if (messages.length === 0) setHeldCanvas(null)
  }, [messages.length])

  // Persist chat-emitted OpenUI as canvas shell (enables CanvasSlot patches)
  useEffect(() => {
    if (isStreaming || !live?.content || !onShellDocument) return
    if (!looksLikeOpenUI(live.content, false)) return
    if (lastSyncedShellRef.current === live.content) return
    lastSyncedShellRef.current = live.content
    onShellDocument(live.content)
  }, [isStreaming, live?.content, live?.messageId, onShellDocument])

  // Prefer stored shell when not streaming a new OpenUI reply (slot patches keep shell string stable)
  const document =
    isStreaming && live
      ? live
      : canvasShell
        ? {
            messageId: `canvas-shell`,
            content: canvasShell,
            isStreaming: false,
          }
        : live
          ? live
          : heldCanvas
            ? { ...heldCanvas, isStreaming: false }
            : null

  const lastMessage = messages[messages.length - 1]
  const waitingForCanvasUpdate =
    isStreaming &&
    lastMessage?.role === "assistant" &&
    !looksLikeOpenUI(lastMessage.content, true) &&
    !!document

  const showTypingOnEmpty =
    isStreaming &&
    !document &&
    (messages.length === 0 ||
      lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" && lastMessage.content === ""))

  const isCanvasRendering =
    Boolean(document?.isStreaming) || waitingForCanvasUpdate || showTypingOnEmpty

  useEffect(() => {
    if (!isLoaded) return
    if (messages.length === 0 && !hasPlayedIntroRef.current) {
      setHasAnimated(true)
      hasPlayedIntroRef.current = true
    } else if (messages.length > 0) {
      setHasAnimated(false)
      hasPlayedIntroRef.current = true
    }
  }, [isLoaded, messages.length])

  if (!isLoaded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background">
        <AnimatedOrb size={64} glow />
      </div>
    )
  }

  const empty = !document && !error && !isStreaming && messages.length === 0

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-y-auto bg-background",
        topOffsetClassName,
        bottomOffsetClassName,
        "px-4 sm:px-6"
      )}
      role="main"
      aria-label="Agent canvas"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--muted)/0.45),transparent_55%)]"
        aria-hidden
      />

      {empty && (
        <div className="relative flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center text-center text-muted-foreground">
          <div className={`mb-4 ${hasAnimated ? "orb-intro" : ""}`}>
            <AnimatedOrb size={128} />
          </div>
          <p
            className={`text-lg font-medium text-foreground/80 ${hasAnimated ? "text-blur-intro" : ""}`}
          >
            {username ? `Hi ${username}` : "Hi"} — ready when you are
          </p>
          <p
            className={`mt-1 max-w-sm text-sm text-muted-foreground ${hasAnimated ? "text-blur-intro-delay" : ""}`}
          >
            Chat below — dashboards and trades update this canvas in place.
          </p>
        </div>
      )}

      {!empty && !document && !error && (
        <div className="relative flex min-h-[calc(100dvh-10rem)] flex-col items-center justify-center">
          {showTypingOnEmpty ? (
            <div className="flex flex-col items-center gap-3">
              <AnimatedOrb size={64} glow />
              <TypingIndicator />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
              <AnimatedOrb size={72} />
              <p className="text-sm">Blank canvas — ask for a dashboard to paint it</p>
            </div>
          )}
        </div>
      )}

      {document && (
        <div className="relative mx-auto w-full max-w-[min(100%,72rem)]">
          {(waitingForCanvasUpdate || document.isStreaming) && (
            <div className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <AnimatedOrb size={20} glow />
              <span>
                {document.isStreaming ? "Rendering canvas…" : "Updating canvas…"}
              </span>
            </div>
          )}
          <CanvasRenderGlow active={isCanvasRendering} className="w-full min-w-0">
            <section
              key="living-canvas"
              className="w-full min-w-0 animate-in fade-in rounded-2xl duration-200"
            >
              <ThemeProvider mode="dark" cssSelector=".openui-bloom">
                <div className="openui-bloom w-full min-w-0 p-1 [&_.recharts-responsive-container]:!w-full">
                  <Renderer
                    library={bloomLibrary}
                    response={document.content}
                    isStreaming={document.isStreaming}
                    onAction={onOpenUIAction}
                  />
                </div>
              </ThemeProvider>
            </section>
          </CanvasRenderGlow>
        </div>
      )}

      {error && (
        <div className="relative mx-auto mt-4 w-full max-w-2xl">
          <div
            className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
            role="alert"
          >
            <AlertCircle
              className="h-5 w-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Something went wrong</p>
              <p className="mt-0.5 text-xs text-destructive/80">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Retry sending message"
            >
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
