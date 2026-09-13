"use client"

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import type { LiveAgentStep } from "./agent-activity-dock"
import type { TradeTapeRow } from "./live-trade-tape"
import type { ClientCanvasModel } from "./canvas-widget-host"
import { getSlotOpenui } from "@/server/services/canvas/model"

export type LiveTickPoint = {
  at: string
  price: number
  pair: string
  usd?: number
}

/** Market / mission live stream — updates often (ticks). */
export type MarketFeedState = {
  liveActive: boolean
  working: boolean
  events: LiveAgentStep[]
  tapeRows: TradeTapeRow[]
  lastTick: Record<string, unknown> | null
  tickHistory: LiveTickPoint[]
  watchedPair: { symbol0: string; symbol1: string } | null
  missionAction: (action: string, missionId?: string | null) => Promise<void>
  switchMarket: (symbol0: string, symbol1: string) => Promise<void>
}

/** Canvas shell / slots — updates on patches only (not every tick). */
export type CanvasFeedState = {
  canvasModel: ClientCanvasModel | null
  moveSlot: (slotId: string, x: number, y: number) => Promise<void>
  syncCanvasShell: (openuiDocument: string) => Promise<void>
  refreshLiveStatus: () => Promise<boolean>
}

const defaultMarket: MarketFeedState = {
  liveActive: false,
  working: false,
  events: [],
  tapeRows: [],
  lastTick: null,
  tickHistory: [],
  watchedPair: null,
  missionAction: async () => {},
  switchMarket: async () => {},
}

const defaultCanvas: CanvasFeedState = {
  canvasModel: null,
  moveSlot: async () => {},
  syncCanvasShell: async () => {},
  refreshLiveStatus: async () => false,
}

const MarketFeedContext = createContext<MarketFeedState>(defaultMarket)
const CanvasFeedContext = createContext<CanvasFeedState>(defaultCanvas)

export function LiveFeedProvider({
  market,
  canvas,
  children,
}: {
  market: MarketFeedState
  canvas: CanvasFeedState
  children: ReactNode
}) {
  const marketValue = useMemo(
    () => market,
    [
      market.liveActive,
      market.working,
      market.events,
      market.tapeRows,
      market.lastTick,
      market.tickHistory,
      market.watchedPair,
      market.missionAction,
      market.switchMarket,
    ]
  )
  const canvasValue = useMemo(
    () => canvas,
    [
      canvas.canvasModel,
      canvas.moveSlot,
      canvas.syncCanvasShell,
      canvas.refreshLiveStatus,
    ]
  )

  return (
    <CanvasFeedContext.Provider value={canvasValue}>
      <MarketFeedContext.Provider value={marketValue}>
        {children}
      </MarketFeedContext.Provider>
    </CanvasFeedContext.Provider>
  )
}

/** Live market ticks / activity — does NOT include canvas shell. */
export function useLiveFeed() {
  return useContext(MarketFeedContext)
}

export function useCanvasFeed() {
  return useContext(CanvasFeedContext)
}

/** Named OpenUI slot content from the living canvas model. */
export function useCanvasSlot(slotId: string) {
  const { canvasModel } = useCanvasFeed()
  return getSlotOpenui(
    canvasModel
      ? {
          conversationId: null,
          layout: canvasModel.layout,
          widgets: canvasModel.widgets,
          openuiDocument: canvasModel.openuiDocument,
          revision: canvasModel.revision,
        }
      : null,
    slotId
  )
}

export function useCanvasShell(): string | null {
  const { canvasModel } = useCanvasFeed()
  const doc = canvasModel?.openuiDocument
  return typeof doc === "string" && doc.trim() ? doc : null
}

/** @deprecated combined shape — prefer useLiveFeed + useCanvasFeed */
export type LiveFeedState = MarketFeedState & CanvasFeedState
