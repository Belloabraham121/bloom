"use client"

import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type GlowPhase = "off" | "active" | "settling"

/**
 * Soft rotating border + aura while OpenUI is streaming or settling after paint.
 */
export function CanvasRenderGlow({
  active,
  className,
  children,
  settleMs = 520,
}: {
  /** True while content is still generating / first appearing */
  active: boolean
  className?: string
  children: ReactNode
  /** Keep glowing briefly after active flips false so paint can finish */
  settleMs?: number
}) {
  const [phase, setPhase] = useState<GlowPhase>(active ? "active" : "off")

  useEffect(() => {
    if (active) {
      setPhase("active")
      return
    }
    if (phase === "off") return
    setPhase("settling")
    const id = window.setTimeout(() => setPhase("off"), settleMs)
    return () => window.clearTimeout(id)
    // phase intentionally omitted — only react to active edges
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settleMs])

  return (
    <div
      className={cn("canvas-render-glow", className)}
      data-glow={phase === "off" ? undefined : phase}
      aria-busy={phase !== "off"}
    >
      <div className="canvas-render-glow-inner rounded-2xl">{children}</div>
    </div>
  )
}
