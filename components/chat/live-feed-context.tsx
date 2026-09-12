"use client"

import {
  createContext,
  useContext,
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

export type LiveFeedState = {
  liveActive: boolean
  working: boolean
  events: LiveAgentStep[]
  tapeRows: TradeTapeRow[]
  lastTick: Record<string, unknown> | null
  tickHistory: LiveTickPoint[]
  watchedPair: { symbol0: string; symbol1: string } | null
  missionAction: (action: string, missionId?: string | null) => Promise<void>
  switchMarket: (symbol0: string, symbol1: string) => Promise<void>
  /** Incremental OpenUI canvas model (shell + named slots). */
  canvasModel: ClientCanvasModel | null
}

const defaultState: LiveFeedState = {
  liveActive: false,
  working: false,
  events: [],
  tapeRows: [],
  lastTick: null,
  tickHistory: [],
  watchedPair: null,
  missionAction: async () => {},
  switchMarket: async () => {},
  canvasModel: null,
}

const LiveFeedContext = createContext<LiveFeedState>(defaultState)

export function LiveFeedProvider({
  value,
  children,
}: {
  value: LiveFeedState
  children: ReactNode
}) {
  return (
    <LiveFeedContext.Provider value={value}>{children}</LiveFeedContext.Provider>
  )
}

export function useLiveFeed() {
  return useContext(LiveFeedContext)
}

/** Named OpenUI slot content from the living canvas model. */
export function useCanvasSlot(slotId: string) {
  const { canvasModel } = useLiveFeed()
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
  const { canvasModel } = useLiveFeed()
  const doc = canvasModel?.openuiDocument
  return typeof doc === "string" && doc.trim() ? doc : null
}
