"use client"

import { cn } from "@/lib/utils"
import type { Message } from "./chat-shell"
import { User } from "lucide-react"
import { MarkdownRenderer } from "./markdown-renderer"
import Image from "next/image"
import { AnimatedOrb } from "./animated-orb"
import { Renderer, type ActionEvent } from "@openuidev/react-lang"
import { ThemeProvider } from "@openuidev/react-ui/ThemeProvider"
import { bloomLibrary } from "@/lib/openui/bloom-library"
import { looksLikeOpenUI } from "@/lib/openui/detect"

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  onOpenUIAction?: (event: ActionEvent) => void
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function MessageBubble({
  message,
  isStreaming = false,
  onOpenUIAction,
}: MessageBubbleProps) {
  const isUser = message.role === "user"
  const useOpenUI = !isUser && looksLikeOpenUI(message.content, isStreaming)

  return (
    <div
      className={cn(
        "flex gap-2",
        isUser
          ? "ml-auto max-w-[90%] flex-row-reverse user-message-enter md:max-w-[80%]"
          : "mr-auto w-full max-w-[min(100%,56rem)] animate-in fade-in slide-in-from-bottom-2 items-end duration-300"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border",
          isUser ? "bg-card" : "bg-muted",
          !isUser && isStreaming && "sticky bottom-4 self-end transition-all duration-300"
        )}
        aria-hidden="true"
      >
        {isUser ? (
          <User className="h-4 w-4 text-foreground/80" />
        ) : (
          <AnimatedOrb className="h-8 w-8 shrink-0" />
        )}
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-col",
          isUser ? "items-end" : "w-full items-stretch"
        )}
      >
        <span className="mb-1 mt-2 hidden text-xs text-muted-foreground sm:block">
          {isUser ? "You" : "Assistant"}
        </span>

        <div
          className={cn(
            "overflow-hidden rounded-2xl border-none",
            isUser
              ? "rounded-br-md border border-border bg-card text-foreground"
              : "w-full rounded-bl-md bg-transparent text-foreground"
          )}
          style={{
            willChange: isStreaming ? "height" : "auto",
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div className={cn(isUser ? "px-4 py-3" : "w-full py-1")}>
            {isUser ? (
              <div className="flex flex-col gap-2">
                {message.imageData && (
                  <div className="h-20 w-20 overflow-hidden rounded-lg border border-border">
                    <Image
                      src={message.imageData}
                      alt="Uploaded image"
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words text-sm">
                  {message.content}
                </p>
              </div>
            ) : useOpenUI ? (
              <ThemeProvider mode="dark" cssSelector=".openui-bloom">
                <div className="openui-bloom w-full min-w-0 [&_.recharts-responsive-container]:!w-full">
                  <Renderer
                    library={bloomLibrary}
                    response={message.content}
                    isStreaming={isStreaming}
                    onAction={onOpenUIAction}
                  />
                </div>
              </ThemeProvider>
            ) : (
              <MarkdownRenderer
                content={message.content || " "}
                isStreaming={isStreaming}
              />
            )}
          </div>
        </div>

        <span className="mt-1 text-xs text-muted-foreground">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
}
