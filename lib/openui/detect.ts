/** Thesys / OpenUI Gateway stream framing (built in pieces for Turbopack). */
const OPENUI_FRAME = "]]" + ">"
const OPENUI_CONTENT = OPENUI_FRAME + "openui:content"
const OPENUI_END = OPENUI_FRAME + "openui:end"

/**
 * Strip Thesys / OpenUI Gateway framing and keep a single OpenUI Lang program.
 * Models often emit framed openui:content / openui:end blocks plus fences.
 */
function normalizeOpenUIContent(content: string): string {
  let text = content.replace(/\r\n/g, "\n")

  // Prefer the last framed block when multiple openui:content segments appear
  const parts: string[] = []
  let searchFrom = 0
  while (searchFrom < text.length) {
    const start = text.indexOf(OPENUI_CONTENT, searchFrom)
    if (start < 0) break
    const afterHeaderNl = text.indexOf("\n", start)
    if (afterHeaderNl < 0) break
    const bodyStart = afterHeaderNl + 1
    const nextContent = text.indexOf(OPENUI_CONTENT, bodyStart)
    const nextEnd = text.indexOf(OPENUI_END, bodyStart)
    let bodyEnd = text.length
    if (nextContent >= 0) bodyEnd = Math.min(bodyEnd, nextContent)
    if (nextEnd >= 0) bodyEnd = Math.min(bodyEnd, nextEnd)
    parts.push(text.slice(bodyStart, bodyEnd))
    searchFrom = bodyStart
  }

  if (parts.length > 0) {
    const withRoot = [...parts].reverse().find((p) => /\broot\s*=/.test(p))
    text = withRoot ?? parts[parts.length - 1]!
  }

  // Strip leftover framing lines / fences
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim()
      return !(
        t.startsWith(OPENUI_CONTENT) ||
        t.startsWith(OPENUI_END) ||
        t === "```" ||
        /^```(?:openui-lang|openui|lang)?$/i.test(t)
      )
    })
    .join("\n")
    .trim()

  // Multiple root= programs (model corrected itself mid-stream): keep the last
  const rootStarts: number[] = []
  const rootRe = /(?:^|\n)root\s*=/g
  let m: RegExpExecArray | null
  while ((m = rootRe.exec(text)) !== null) {
    const at = m[0].startsWith("\n") ? m.index + 1 : m.index
    rootStarts.push(at)
  }
  if (rootStarts.length > 1) {
    text = text.slice(rootStarts[rootStarts.length - 1]!).trim()
  }

  return text
}

/** Heuristic: is this assistant content OpenUI Lang (GenUI)? */
function looksLikeOpenUI(content: string, isStreaming = false): boolean {
  const normalized = normalizeOpenUIContent(content)
  const trimmed = normalized.trim() || content.trim()
  if (!trimmed) return false
  if (trimmed.includes("root = Stack(") || /\bStack\s*\(/.test(trimmed)) return true
  if (trimmed.includes("root = Root(") || /\bRoot\s*\(/.test(trimmed)) return true
  if (trimmed.includes("root = Card(") || /\bCard\s*\(/.test(trimmed)) return true
  if (content.includes(OPENUI_FRAME + "openui") || content.includes("openui-lang")) {
    return true
  }
  // Progressive stream: treat incomplete OpenUI Lang as GenUI once root starts.
  if (isStreaming && /^\s*root\s*=/.test(trimmed)) return true
  if (
    /\b(MessageText|TokenList|TokenRow|ChainList|ChainRow|QuoteSummary|ConfirmTx|ConfirmSend|BalanceBoard|ApprovalCard|TxStatusCard|GaslessOrderCard|ChainedPlanCard|LpPositionCard|PoolTelemetry|CostBreakdown|LiveActivity|LiveMarketSwitcher|LiveTradeTape|LiveMarketTick|LiveMarketChart|InflightTrade|CanvasSlot|CanvasFrame|CanvasWorld|TextContent|Table|BarChart|LineChart|PieChart|Button|Form|Tabs)\s*\(/.test(
      trimmed
    )
  ) {
    return true
  }
  return false
}

/** Map chat button text → direct market control (skip LLM round-trip). */
function parseLiveMarketControl(
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
function extractOpenUICaption(content: string): string | null {
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
function resolveCanvasDocument(
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

export {
  normalizeOpenUIContent,
  looksLikeOpenUI,
  parseLiveMarketControl,
  extractOpenUICaption,
  resolveCanvasDocument,
}
