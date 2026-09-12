/**
 * Map raw Substreams / poll payloads into MarketEvent shapes.
 */

import type { MarketEvent } from "@/server/services/market/bus"

const UNISWAP_V3_SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed80033e63e5ddaca"

export function marketEventFromSwap(params: {
  chainId: number
  pool?: string
  token0?: string
  token1?: string
  symbol0?: string
  symbol1?: string
  amount0?: string
  amount1?: string
  price?: string
  block?: number
  tx?: string
}): Omit<MarketEvent, "type" | "at"> {
  return {
    chainId: params.chainId,
    pool: params.pool,
    token0: params.token0,
    token1: params.token1,
    symbol0: params.symbol0,
    symbol1: params.symbol1,
    amount0: params.amount0,
    amount1: params.amount1,
    price: params.price,
    block: params.block,
    tx: params.tx,
  }
}

/** Best-effort parse of ethereum-common style log maps. */
export function tryParseUniswapSwapLog(
  chainId: number,
  log: {
    address?: string
    topics?: string[]
    data?: string
    transactionHash?: string
    blockNumber?: number | string
  }
): Omit<MarketEvent, "type" | "at"> | null {
  const topic0 = log.topics?.[0]?.toLowerCase()
  if (topic0 !== UNISWAP_V3_SWAP_TOPIC) return null
  return marketEventFromSwap({
    chainId,
    pool: log.address,
    tx: log.transactionHash,
    block:
      typeof log.blockNumber === "string"
        ? Number(log.blockNumber)
        : log.blockNumber,
  })
}

export { UNISWAP_V3_SWAP_TOPIC }
