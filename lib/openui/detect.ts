/**
 * Strip Thesys / OpenUI Gateway framing and keep a single OpenUI Lang program.
 * Models often emit `]]>openui:content?thesys=true` … `]]>openui:end` plus fences.
 */
export function normalizeOpenUIContent(content: string): string {
  let text = content.replace(/\r\n/g, "\n")

  // Prefer the last framed block when multiple openui:content segments appear
  const framed = [
    ...text.matchAll(
      /\]\]>openui:content[^\n]*\n([\s\S]*?)(?=\]\]>openui:content|\]\]>openui:end|$)/gi
    ),
  ]
  if (framed.length > 0) {
    const withRoot = [...framed].reverse().find((m) => /\broot\s*=/.test(m[1]))
    text = (withRoot ?? framed[framed.length - 1])[1]
  }

  text = text
    .replace(/\]\]>openui:(?:content|end)[^\n]*/gi, "")
    .replace(/^```(?:openui-lang|openui|lang)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim()

  // Multiple root= programs (model corrected itself mid-stream): keep the last
  const rootStarts = [...text.matchAll(/(?:^|\n)(root\s*=)/g)]
  if (rootStarts.length > 1) {
    const last = rootStarts[rootStarts.length - 1]
    const idx = last.index! + (last[0].startsWith("\n") ? 1 : 0)
    text = text.slice(idx).trim()
  }

  return text
}

/** Heuristic: is this assistant content OpenUI Lang (GenUI)? */
export function looksLikeOpenUI(content: string, isStreaming = false): boolean {
  const normalized = normalizeOpenUIContent(content)
  const trimmed = normalized.trim() || content.trim()
  if (!trimmed) return false
  if (trimmed.includes("root = Stack(") || /\bStack\s*\(/.test(trimmed)) return true
  if (trimmed.includes("root = Root(") || /\bRoot\s*\(/.test(trimmed)) return true
  if (trimmed.includes("root = Card(") || /\bCard\s*\(/.test(trimmed)) return true
  if (content.includes("]]>openui") || content.includes("openui-lang")) return true
  // Progressive stream: treat incomplete OpenUI Lang as GenUI once root starts.
  if (isStreaming && /^\s*root\s*=/.test(trimmed)) return true
  if (
    /\b(MessageText|TokenList|TokenRow|ChainList|ChainRow|QuoteSummary|ConfirmTx|ApprovalCard|TxStatusCard|GaslessOrderCard|ChainedPlanCard|LpPositionCard|PoolTelemetry|CostBreakdown|LiveActivity|LiveMarketSwitcher|LiveTradeTape|LiveMarketTick|LiveMarketChart|InflightTrade|CanvasSlot|TextContent|Table|BarChart|LineChart|PieChart|Button|Form|Tabs)\s*\(/.test(
      trimmed
    )
  ) {
    return true
  }
  return false
}

/** Map chat button text → direct market control (skip LLM round-trip). */
export function parseLiveMarketControl(
  text: string
): "pause" | "resume" | "stop" | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  if (
    /\b(pause|pausing)\b/.test(t) &&
    /\b(live|market|watch|mission)\b/.test(t)
  ) {
    return "pause"
  }
  if (
    (/\b(resume|play|start|unpause)\b/.test(t) &&
      /\b(live|market|watch|mission)\b/.test(t)) ||
    t === "start live market watch" ||
    t === "resume live market watch" ||
    t === "play live market watch"
  ) {
    return "resume"
  }
  if (
    /\b(stop|end|cancel)\b/.test(t) &&
    /\b(live|market|watch|mission)\b/.test(t)
  ) {
    return "stop"
  }
  return null
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
      content: normalizeOpenUIContent(message.content),
      isStreaming: streamingThis,
    }
  }

  return null
}
