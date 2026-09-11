export type QuoteRouting =
  | "CLASSIC"
  | "DUTCH_V2"
  | "DUTCH_V3"
  | "PRIORITY"
  | "BRIDGE"
  | "WRAP"
  | "UNWRAP"
  | "CHAINED"
  | string

export type ExecutionPath =
  | "order"
  | "swap"
  | "swap_5792"
  | "swap_7702"
  | "plan"

/**
 * Decide which Trade API path to use after a quote.
 * Batch paths are selected when the caller prefers EIP-5792/7702.
 */
export function resolveExecutionPath(
  routing: QuoteRouting | undefined,
  preferBatch?: "swap_5792" | "swap_7702" | null
): ExecutionPath {
  const r = (routing || "").toUpperCase()

  if (r === "CHAINED") return "plan"
  if (r === "DUTCH_V2" || r === "DUTCH_V3" || r === "PRIORITY") return "order"

  if (preferBatch === "swap_5792") return "swap_5792"
  if (preferBatch === "swap_7702") return "swap_7702"

  return "swap"
}

export function stripQuoteForSwap(quote: Record<string, unknown>) {
  const { permitData, permitTransaction, ...clean } = quote
  return {
    clean,
    permitData,
    permitTransaction,
  }
}
