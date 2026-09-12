/** Heuristic: is this assistant content OpenUI Lang (GenUI)? */
export function looksLikeOpenUI(content: string, isStreaming = false): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  if (trimmed.includes("root = Stack(") || /\bStack\s*\(/.test(trimmed)) return true
  if (trimmed.includes("root = Root(") || /\bRoot\s*\(/.test(trimmed)) return true
  if (trimmed.includes("root = Card(") || /\bCard\s*\(/.test(trimmed)) return true
  if (trimmed.startsWith("]]>openui") || trimmed.includes("openui-lang")) return true
  // Progressive stream: treat incomplete OpenUI Lang as GenUI once root starts.
  if (isStreaming && /^\s*root\s*=/.test(trimmed)) return true
  if (
    /\b(MessageText|TokenList|TokenRow|ChainList|ChainRow|QuoteSummary|ConfirmTx|ApprovalCard|TxStatusCard|GaslessOrderCard|ChainedPlanCard|LpPositionCard|PoolTelemetry|CostBreakdown|LiveActivity|LiveTradeTape|LiveMarketTick|InflightTrade|CanvasSlot|TextContent|Table|BarChart|LineChart|PieChart|Button|Form|Tabs)\s*\(/.test(
      trimmed
    )
  ) {
    return true
  }
  return false
}

/** Pull short caption from MessageText("...") for the chat modal. */
export function extractOpenUICaption(content: string): string | null {
  const match = content.match(/MessageText\(\s*"((?:\\.|[^"\\])*)"/)
  if (!match) return null
  return match[1]
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
}

export type CanvasDocument = {
  messageId: string
  content: string
  isStreaming: boolean
}

/**
 * Latest OpenUI Lang document for the living canvas.
 * Plain-text assistant turns do not clear the canvas — previous GenUI stays.
 */
export function resolveCanvasDocument(
  messages: Array<{ id: string; role: string; content: string }>,
  isStreaming: boolean
): CanvasDocument | null {
  const lastId = messages[messages.length - 1]?.id

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "assistant") continue
    if (!message.content.trim()) continue
    const streamingThis =
      isStreaming && message.id === lastId && message.role === "assistant"
    if (!looksLikeOpenUI(message.content, streamingThis)) continue
    return {
      messageId: message.id,
      content: message.content,
      isStreaming: streamingThis,
    }
  }

  return null
}
