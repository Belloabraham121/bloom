"use client"

import { useEffect, useRef, useState } from "react"
import { MessageBubble } from "./message-bubble"
import type { Message } from "./chat-shell"
import { TypingIndicator } from "./typing-indicator"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedOrb } from "./animated-orb"

interface MessageListProps {
  messages: Message[]
  isStreaming: boolean
  error: string | null
  onRetry: () => void
  isLoaded: boolean
  username?: string
  onOpenUIAction?: (event: import("@openuidev/react-lang").ActionEvent) => void
}

export function MessageList({
  messages,
  isStreaming,
  error,
  onRetry,
  isLoaded,
  username,
  onOpenUIAction,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const rafRef = useRef<number | null>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const lastScrollRef = useRef<number>(0)
  const hasPlayedIntroRef = useRef(false)

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

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    container.scrollTop = container.scrollHeight
    setAutoScroll(true)
  }, [messages.length])

  useEffect(() => {
    if (!isStreaming || !autoScroll || !containerRef.current) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    const container = containerRef.current
    lastScrollRef.current = container.scrollTop

    const smoothScroll = () => {
      if (!container) return

      const { scrollHeight, clientHeight } = container
      const targetScroll = scrollHeight - clientHeight
      const currentScroll = lastScrollRef.current
      const diff = targetScroll - currentScroll

      if (diff > 0.5) {
        const newScroll = currentScroll + diff * 0.03
        lastScrollRef.current = newScroll
        container.scrollTop = newScroll
      }

      rafRef.current = requestAnimationFrame(smoothScroll)
    }

    rafRef.current = requestAnimationFrame(smoothScroll)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isStreaming, autoScroll])

  const handleScroll = () => {
    if (!containerRef.current || isStreaming) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150
    setAutoScroll(isAtBottom)
  }

  const lastMessage = messages[messages.length - 1]
  const showTypingIndicator =
    isStreaming &&
    (messages.length === 0 ||
      lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" && lastMessage?.content === ""))

  if (!isLoaded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatedOrb size={64} />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="absolute inset-0 space-y-4 overflow-y-auto border-none px-4 pb-36 pt-16 sm:px-6"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      {messages.length === 0 && !error && !isStreaming && (
        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
          <div className={`mb-4 ${hasAnimated ? "orb-intro" : ""}`}>
            <AnimatedOrb size={128} />
          </div>
          <p
            className={`text-lg font-medium text-foreground/80 ${hasAnimated ? "text-blur-intro" : ""}`}
          >
            {username ? `Hi ${username}` : "Hi"} — ready when you are
          </p>
          <p
            className={`mt-1 text-sm text-muted-foreground ${hasAnimated ? "text-blur-intro-delay" : ""}`}
          >
            Ask about pools, routes, or trading intent — widgets render live.
          </p>
        </div>
      )}

      {messages
        .filter((message) => {
          if (
            isStreaming &&
            message.role === "assistant" &&
            message === lastMessage &&
            message.content === ""
          ) {
            return false
          }
          return true
        })
        .map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={
              isStreaming && message.role === "assistant" && message === lastMessage
            }
            onOpenUIAction={onOpenUIAction}
          />
        ))}

      {showTypingIndicator && <TypingIndicator />}

      {error && (
        <div
          className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
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
      )}

      <div ref={bottomRef} aria-hidden="true" className="h-20" />
    </div>
  )
}
