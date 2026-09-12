export type MissionStrategy = "watch" | "swap_dca" | "range_lp" | "arb_scan"
export type MissionStatus = "draft" | "running" | "paused" | "stopped" | "error"

export type MissionGuardrails = {
  maxNotionalUsd?: number
  dailyLossCapUsd?: number
  minEdgeBps?: number
  cooldownMs?: number
  allowlistTokens?: string[]
  allowlistChainIds?: number[]
}

export type MissionParams = {
  chainId?: number
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  slippageBps?: number
  intervalMs?: number
  priceThreshold?: string
  poolAddress?: string
  /** LP */
  tickLower?: number
  tickUpper?: number
  /** Arb */
  poolA?: string
  poolB?: string
  [key: string]: unknown
}
