"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, User } from "lucide-react"
import Image from "next/image"
import type { Message } from "./chat-shell"
import { extractOpenUICaption, looksLikeOpenUI } from "@/lib/openui/detect"
import { MarkdownRenderer } from "./markdown-renderer"
import { AnimatedOrb } from "./animated-orb"
import { cn } from "@/lib/utils"

interface ChatTranscriptProps {
  messages: Message[]
  isStreaming: boolean
}

type ModalEntry =
  | { kind: "user"; id: string; content: string; imageData?: string }
  | { kind: "text"; id: string; content: string; isStreaming: boolean }
  | { kind: "canvas"; id: string; caption: string }

function toModalEntries(messages: Message[], isStreaming: boolean): ModalEntry[] {
  const lastId = messages[messages.length - 1]?.id
  const entries: ModalEntry[] = []

  for (const message of messages) {
    if (message.role === "user") {
      entries.push({
        kind: "user",
        id: message.id,
        content: message.content,
        imageData: message.imageData,
      })
      continue
    }

    if (message.role !== "assistant") continue
    const streamingThis =
      isStreaming && message.id === lastId && message.role === "assistant"
    if (!message.content.trim() && streamingThis) {
      entries.push({ kind: "text", id: message.id, content: "", isStreaming: true })
      continue
    }
    if (!message.content.trim()) continue

    if (looksLikeOpenUI(message.content, streamingThis)) {
      const caption =
        extractOpenUICaption(message.content) ||
        (streamingThis ? "Updating canvas…" : "Canvas updated")
      entries.push({ kind: "canvas", id: message.id, caption })
      continue
    }

    entries.push({
      kind: "text",
      id: message.id,
      content: message.content,
      isStreaming: streamingThis,
    })
  }

  return entries
}

function previewFor(entry: ModalEntry | undefined): string {
  if (!entry) return ""
  if (entry.kind === "user") {
    return entry.content.length > 120
      ? `${entry.content.slice(0, 120)}…`
      : entry.content
  }
  if (entry.kind === "canvas") return entry.caption
  if (!entry.content.trim()) return "…"
  return entry.content.length > 120
    ? `${entry.content.slice(0, 120)}…`
    : entry.content
}

export function ChatTranscript({ messages, isStreaming }: ChatTranscriptProps) {
  const entries = toModalEntries(messages, isStreaming)
  const last = entries[entries.length - 1]
  const lastIsText =
    last?.kind === "text" && (last.isStreaming || last.content.trim().length > 0)

  const [expanded, setExpanded] = useState(false)

  // Auto-open when the agent speaks in plain text.
  useEffect(() => {
    if (lastIsText) setExpanded(true)
  }, [lastIsText, last?.id])

  if (entries.length === 0) return null

  const who =
    last?.kind === "user" ? "You" : last?.kind === "canvas" ? "Canvas" : "Agent"

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-2xl">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse chat" : "Expand chat"}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            {last?.kind === "user" ? (
              <User className="h-3 w-3 text-muted-foreground" />
            ) : (
              <AnimatedOrb className="h-6 w-6" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="text-foreground/80">{who}</span>
            {": "}
            {previewFor(last)}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div
            className="max-h-56 space-y-2 overflow-y-auto border-t border-border/60 px-3 py-2"
            role="log"
            aria-label="Chat"
          >
            {entries.map((entry) => {
              if (entry.kind === "user") {
                return (
                  <div key={entry.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl bg-muted px-2.5 py-1.5 text-xs text-foreground">
                      {entry.imageData && (
                        <div className="mb-1 h-10 w-10 overflow-hidden rounded-md border border-border">
                          <Image
                            src={entry.imageData}
                            alt="Attachment"
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">{entry.content}</p>
                    </div>
                  </div>
                )
              }

              if (entry.kind === "canvas") {
                return (
                  <div key={entry.id} className="flex justify-start">
                    <p className="rounded-xl border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                      {entry.caption}
                    </p>
                  </div>
                )
              }

              return (
                <div key={entry.id} className="flex justify-start">
                  <div
                    className={cn(
                      "max-w-[92%] rounded-xl border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs text-foreground/90"
                    )}
                  >
                    {entry.content.trim() ? (
                      <MarkdownRenderer
                        content={entry.content}
                        isStreaming={entry.isStreaming}
                      />
                    ) : (
                      <span className="text-muted-foreground">Thinking…</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
