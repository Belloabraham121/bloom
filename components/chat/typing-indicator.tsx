"use client"

import { AnimatedOrb } from "./animated-orb"

export function TypingIndicator() {
  return (
    <div className="mr-auto flex max-w-[90%] animate-in fade-in slide-in-from-bottom-2 gap-3 duration-300 md:max-w-[80%]">
      <div className="shrink-0">
        <AnimatedOrb size={32} />
      </div>

      <div
        className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3"
        role="status"
        aria-label="Assistant is typing"
      >
        <div className="flex items-center gap-1">
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  )
}
