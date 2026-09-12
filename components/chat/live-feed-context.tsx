"use client"

import {
  createContext,
  useContext,
  type ReactNode,
} from "react"
import type { LiveAgentStep } from "./agent-activity-dock"
import type { TradeTapeRow } from "./live-trade-tape"

export type LiveFeedState = {
  liveActive: boolean
  working: boolean
  events: LiveAgentStep[]
  tapeRows: TradeTapeRow[]
  lastTick: Record<string, unknown> | null
  missionAction: (action: string, missionId?: string | null) => Promise<void>
}

const defaultState: LiveFeedState = {
  liveActive: false,
  working: false,
  events: [],
  tapeRows: [],
  lastTick: null,
  missionAction: async () => {},
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
