"use client"

import type React from "react"
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ChevronDown, ExternalLink, GripVertical, Pause, Play, Square } from "lucide-react"
import { AnimatedOrb } from "./animated-orb"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TradeTapeRow } from "./live-trade-tape"
import { useLiveFeed } from "./live-feed-context"

const STORAGE_KEY = "bloom-tx-hub-y"
const TOP_CLAMP = 64
const BOTTOM_CLAMP = 180

type PersistedTx = {
  id: string
  category: string
  status: string
  chainId?: number | null
  txHash?: string | null
  createdAt?: string
  updatedAt?: string
}

export type HubTxRow = {
  id: string
  category: string
  side?: string
  status: string
  txHash?: string
  chainId?: number
  at: string
}

function txExplorerUrl(chainId: number | undefined, txHash: string): string {
  if (chainId === 1) return `https://etherscan.io/tx/${txHash}`
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`
  if (chainId === 42161) return `https://arbiscan.io/tx/${txHash}`
  if (chainId === 10) return `https://optimistic.etherscan.io/tx/${txHash}`
  if (chainId === 137) return `https://polygonscan.com/tx/${txHash}`
  return `https://blockscan.com/tx/${txHash}`
}

const PENDING_STATUSES = new Set([
  "pending",
  "quoting",
  "signing",
  "submitted",
  "broadcasting",
  "confirming",
])

function isPendingStatus(status: string): boolean {
  const s = status.toLowerCase()
  return (
    PENDING_STATUSES.has(s) ||
    s.includes("pending") ||
    s.includes("quot") ||
    s.includes("sign")
  )
}

function mergeTxRows(
  persisted: PersistedTx[],
  tapeRows: TradeTapeRow[]
): HubTxRow[] {
  const byKey = new Map<string, HubTxRow>()

  for (const row of persisted) {
    const hub: HubTxRow = {
      id: row.id,
      category: row.category,
      status: row.status,
      txHash: row.txHash ?? undefined,
      chainId: row.chainId ?? undefined,
      at: row.updatedAt || row.createdAt || new Date().toISOString(),
    }
    const key = row.txHash ? `hash:${row.txHash}` : `id:${row.id}`
    byKey.set(key, hub)
  }

  for (const row of tapeRows) {
    const hub: HubTxRow = {
      id: row.id,
      category: row.side || "swap",
      side: row.side,
      status: row.status || "update",
      txHash: row.txHash,
      chainId: row.chainId,
      at: row.at || new Date().toISOString(),
    }
    const key = row.txHash ? `hash:${row.txHash}` : `tape:${row.id}`
    const existing = byKey.get(key)
    if (existing) {
      byKey.set(key, {
        ...existing,
        ...hub,
        category: hub.category || existing.category,
        at: hub.at > existing.at ? hub.at : existing.at,
      })
    } else {
      byKey.set(key, hub)
    }
  }

  return [...byKey.values()].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  )
}

function clampY(y: number, viewportH: number, hubH: number): number {
  const min = TOP_CLAMP
  const max = Math.max(min, viewportH - BOTTOM_CLAMP - hubH)
  return Math.min(Math.max(y, min), max)
}

function readStoredY(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

interface TransactionHubProps {
  getAccessToken: () => Promise<string | null>
  className?: string
}

// NOTE: TransactionHub subscribes to the full MarketFeedState via useLiveFeed()
// which includes lastTick/tickHistory — splitting the context would avoid
// re-renders on every market tick. For now, memo prevents parent re-renders.
export const TransactionHub = memo(function TransactionHub({
  getAccessToken,
  className,
}: TransactionHubProps) {
  const {
    liveActive,
    working,
    tapeRows,
    events: agentEvents,
    missionAction,
  } = useLiveFeed()
  const [expanded, setExpanded] = useState(false)
  const [persisted, setPersisted] = useState<PersistedTx[]>([])
  const [y, setY] = useState<number | null>(null)
  const hubRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startClientY: number
    startY: number
    moved: boolean
  } | null>(null)

  const rows = useMemo(
    () => mergeTxRows(persisted, tapeRows),
    [persisted, tapeRows]
  )
  const pendingCount = useMemo(
    () => rows.filter((r) => isPendingStatus(r.status)).length,
    [rows]
  )
  const latestEvent = agentEvents[0]

  // Hydrate persisted transactions on mount
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const res = await fetch("/api/uniswap/tx", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { transactions?: PersistedTx[] }
        if (!cancelled && Array.isArray(data.transactions)) {
          setPersisted(data.transactions)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getAccessToken])

  // Initialize + clamp Y on mount / resize
  useEffect(() => {
    const sync = () => {
      const hubH = hubRef.current?.offsetHeight ?? 48
      const vh = window.innerHeight
      setY((prev) => {
        const stored = prev ?? readStoredY()
        const base = stored ?? Math.round(vh * 0.35)
        return clampY(base, vh, hubH)
      })
    }
    sync()
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [expanded])

  const persistY = useCallback((next: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(next)))
    } catch {
      /* ignore */
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      const hubH = hubRef.current?.offsetHeight ?? 48
      const currentY =
        y ?? clampY(readStoredY() ?? window.innerHeight * 0.35, window.innerHeight, hubH)
      dragRef.current = {
        pointerId: e.pointerId,
        startClientY: e.clientY,
        startY: currentY,
        moved: false,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [y]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const dy = e.clientY - drag.startClientY
      if (Math.abs(dy) > 3) drag.moved = true
      const hubH = hubRef.current?.offsetHeight ?? 48
      const next = clampY(drag.startY + dy, window.innerHeight, hubH)
      setY(next)
    },
    []
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      dragRef.current = null
      if (drag.moved) {
        const hubH = hubRef.current?.offsetHeight ?? 48
        const finalY = clampY(
          drag.startY + (e.clientY - drag.startClientY),
          window.innerHeight,
          hubH
        )
        setY(finalY)
        persistY(finalY)
      } else {
        setExpanded((v) => !v)
      }
    },
    [persistY]
  )

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
    }
  }, [])

  const handlePause = useCallback(() => {
    void missionAction?.(working ? "pause" : "resume")
  }, [missionAction, working])

  const handleStop = useCallback(() => {
    void missionAction?.("stop")
  }, [missionAction])

  if (y == null) return null

  return (
    <div
      ref={hubRef}
      className={cn(
        "pointer-events-auto fixed right-4 z-30 w-[min(100vw-2rem,20rem)] select-none",
        className
      )}
      style={{ top: y }}
    >
      {/* Collapsed pill */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Transaction hub"
        className={cn(
          "flex cursor-grab items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md active:cursor-grabbing",
          expanded && "rounded-b-none border-b-0"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <AnimatedOrb size={22} glow={working} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            {working ? "Working" : liveActive ? "Live" : "Idle"}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {pendingCount > 0
              ? `${pendingCount} pending`
              : rows.length > 0
                ? `${rows.length} tx`
                : "No transactions"}
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/90 px-1.5 text-[10px] font-semibold text-primary-foreground">
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </div>

      {/* Expanded sheet */}
      {expanded && (
        <div className="overflow-hidden rounded-b-2xl border border-t-0 border-border/80 bg-card/95 shadow-lg backdrop-blur-md">
          {liveActive && (
            <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                {latestEvent?.message || "Live session"}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handlePause}
                aria-label={working ? "Pause mission" : "Resume mission"}
              >
                {working ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleStop}
                aria-label="Stop mission"
              >
                <Square className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                Transactions will appear here during swaps and live missions.
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-2 border-b border-border/30 px-3 py-2 text-[11px] last:border-0"
                >
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                    {row.side || row.category}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 capitalize",
                      isPendingStatus(row.status)
                        ? "text-amber-400"
                        : row.status.toLowerCase().includes("fail") ||
                            row.status.toLowerCase().includes("error")
                          ? "text-destructive"
                          : "text-muted-foreground"
                    )}
                  >
                    {row.status}
                  </span>
                  {row.txHash ? (
                    <a
                      href={txExplorerUrl(row.chainId, row.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto flex items-center gap-0.5 font-mono text-[10px] text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {row.txHash.slice(0, 8)}…
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span className="ml-auto text-[10px] text-muted-foreground/60">
                      {new Date(row.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
})
