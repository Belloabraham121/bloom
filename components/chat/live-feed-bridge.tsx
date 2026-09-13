"use client"

import { useMemo, type ReactNode } from "react"
import { LiveFeedProvider } from "./live-feed-context"
import { useMissionLive } from "./use-mission-live"

/**
 * Owns live/canvas mission state. Parent should pass stable `children` so market
 * ticks re-render this bridge + context consumers only — not the whole chrome.
 */
export function LiveFeedBridge({
  conversationId,
  chainId = 1,
  refreshKey,
  children,
}: {
  conversationId?: string | null
  chainId?: number
  refreshKey?: number | string
  children: ReactNode
}) {
  const {
    liveActive,
    liveAvailable,
    agentEvents,
    working,
    tapeRows,
    lastTick,
    tickHistory,
    watchedPair,
    canvasModel,
    missionAction,
    resumeLive,
    switchMarket,
    moveSlot,
    syncCanvasShell,
    refreshLiveStatus,
  } = useMissionLive({
    conversationId,
    chainId,
    refreshKey,
  })

  const liveFromCanvas = Boolean(
    (canvasModel?.widgets?._live?.props as { active?: boolean } | undefined)
      ?.active
  )
  const feedLiveActive = liveActive || liveFromCanvas

  const market = useMemo(
    () => ({
      liveActive: feedLiveActive,
      liveAvailable,
      working,
      events: agentEvents,
      tapeRows,
      lastTick,
      tickHistory,
      watchedPair,
      missionAction,
      resumeLive,
      switchMarket,
    }),
    [
      feedLiveActive,
      liveAvailable,
      working,
      agentEvents,
      tapeRows,
      lastTick,
      tickHistory,
      watchedPair,
      missionAction,
      resumeLive,
      switchMarket,
    ]
  )

  const canvas = useMemo(
    () => ({
      canvasModel,
      moveSlot,
      syncCanvasShell,
      refreshLiveStatus,
    }),
    [canvasModel, moveSlot, syncCanvasShell, refreshLiveStatus]
  )

  return (
    <LiveFeedProvider market={market} canvas={canvas}>
      {children}
    </LiveFeedProvider>
  )
}
