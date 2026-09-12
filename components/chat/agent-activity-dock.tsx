"use client"

import { useEffect, useState } from "react"
import { Pause, Play, Square } from "lucide-react"
import { AnimatedOrb } from "./animated-orb"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type LiveAgentStep = {
  step: string
  message: string
  at: string
  missionId?: string
}

interface AgentActivityDockProps {
  events: LiveAgentStep[]
  working: boolean
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
  className?: string
}

export function AgentActivityDock({
  events,
  working,
  onPause,
  onResume,
  onStop,
  className,
}: AgentActivityDockProps) {
  const [open, setOpen] = useState(true)
  const latest = events[0]

  if (!working && events.length === 0) return null

  return (
    <div
      className={cn(
        "pointer-events-auto mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-md",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <AnimatedOrb size={22} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <p className="text-xs font-medium text-foreground">
            {working ? "Agent working" : "Agent idle"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {latest?.message || "Waiting for signals…"}
          </p>
        </button>
        <div className="flex items-center gap-1">
          {working ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onPause}
              aria-label="Pause mission"
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onResume}
              aria-label="Resume mission"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onStop}
            aria-label="Stop mission"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {open && events.length > 0 && (
        <div className="max-h-28 space-y-1 overflow-y-auto border-t border-border/50 px-3 py-2">
          {events.slice(0, 12).map((e, i) => (
            <div
              key={`${e.at}-${i}`}
              className="flex gap-2 text-[10px] text-muted-foreground"
            >
              <span className="shrink-0 font-mono text-foreground/70">
                {e.step}
              </span>
              <span className="truncate">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Hook-friendly reducer helper */
export function useAgentEventLog(limit = 40) {
  const [events, setEvents] = useState<LiveAgentStep[]>([])
  const push = (step: LiveAgentStep) => {
    setEvents((prev) => [step, ...prev].slice(0, limit))
  }
  const clear = () => setEvents([])
  return { events, push, clear }
}

export function AgentEventLogBootstrap() {
  useEffect(() => {
    /* reserved */
  }, [])
  return null
}
