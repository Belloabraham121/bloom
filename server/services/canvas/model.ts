/**
 * Named canvas widgets + OpenUI slots + patch apply (partial re-render model).
 */

export type WidgetKind =
  | "header"
  | "pool_table"
  | "volume_chart"
  | "wallet_balance"
  | "inflight_trade"
  | "trade_tape"
  | "openui"
  | "custom"

export type WidgetState = {
  kind: WidgetKind
  props: Record<string, unknown>
  updatedAt: string
}

export type CanvasLayoutItem = {
  id: string
  kind: WidgetKind
  region?: string
}

export type CanvasModel = {
  conversationId: string | null
  layout: CanvasLayoutItem[]
  widgets: Record<string, WidgetState>
  /** Shell OpenUI Lang (root = Stack with CanvasSlot placeholders). */
  openuiDocument?: string | null
  revision: number
}

export type CanvasPatchOp = {
  op: "set" | "replace" | "insert" | "remove" | "full" | "add_dashboard" | "move"
  widgetId?: string
  path?: string
  data?: unknown
  kind?: WidgetKind
  region?: string
  openuiDocument?: string | null
  layout?: CanvasLayoutItem[]
  widgets?: Record<string, WidgetState>
  /** Absolute placement for add_dashboard / move (px). Auto-assigned if omitted. */
  x?: number
  y?: number
}

export function emptyCanvas(conversationId: string | null = null): CanvasModel {
  return {
    conversationId,
    layout: [],
    widgets: {},
    openuiDocument: null,
    revision: 0,
  }
}

/** Default Live* board for CanvasSlot("live") — seeded by start_market_watch. */
export const DEFAULT_LIVE_SLOT_OPENUI = `Stack([switcher, activity, tick, chart, tape])
switcher = LiveMarketSwitcher("Markets")
activity = LiveActivity("Agent activity")
tick = LiveMarketTick("Live market")
chart = LiveMarketChart("Price chart")
tape = LiveTradeTape("Trades")`

/** Default first-paint shell with spatially separated live + quote. */
export const DEFAULT_SPATIAL_SHELL_OPENUI = `root = Stack([world])
world = CanvasWorld([title, live_slot, quote_slot])
title = TextContent("Trading desk", "large-heavy")
live_slot = CanvasSlot("live", 40, 80)
quote_slot = CanvasSlot("quote", 520, 80)`

export const DASHBOARD_GRID = {
  originX: 40,
  originY: 80,
  cellW: 480,
  cellH: 420,
  cols: 3,
} as const

export function nextDashboardPosition(
  occupiedCount: number,
  cols = DASHBOARD_GRID.cols
): { x: number; y: number } {
  const col = occupiedCount % cols
  const row = Math.floor(occupiedCount / cols)
  return {
    x: DASHBOARD_GRID.originX + col * DASHBOARD_GRID.cellW,
    y: DASHBOARD_GRID.originY + row * DASHBOARD_GRID.cellH,
  }
}

/** Parse CanvasSlot("id", x, y) placements from a shell document. */
export function listSlotPlacementsFromShell(
  doc: string | null | undefined
): Array<{ id: string; x: number; y: number }> {
  if (!doc) return []
  const out: Array<{ id: string; x: number; y: number }> = []
  const re =
    /CanvasSlot\(\s*"([^"]+)"\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*)?\)/g
  let m: RegExpExecArray | null
  let fallbackIndex = 0
  while ((m = re.exec(doc)) !== null) {
    const id = m[1]!
    if (m[2] != null && m[3] != null) {
      out.push({ id, x: Number(m[2]), y: Number(m[3]) })
    } else {
      const pos = nextDashboardPosition(fallbackIndex++)
      out.push({ id, x: pos.x, y: pos.y })
    }
  }
  return out
}

function slotVarName(slotId: string) {
  const safe = slotId.replace(/[^a-zA-Z0-9_]/g, "_") || "panel"
  return `${safe}_slot`
}

/**
 * Inject CanvasSlot(id, x, y) into an existing shell without wiping other panels.
 * Creates a spatial shell if none exists.
 */
export function injectCanvasSlotIntoShell(
  doc: string | null | undefined,
  slotId: string,
  x: number,
  y: number
): string {
  const varName = slotVarName(slotId)
  const assignment = `${varName} = CanvasSlot("${slotId}", ${x}, ${y})`
  const trimmed = doc?.trim() ?? ""

  if (!trimmed) {
    return `root = Stack([world])
world = CanvasWorld([title, ${varName}])
title = TextContent("Trading desk", "large-heavy")
${assignment}`
  }

  if (new RegExp(`CanvasSlot\\(\\s*"${escapeRegExp(slotId)}"`).test(trimmed)) {
    return trimmed
  }

  // Prefer injecting into CanvasWorld([...]) children
  const worldMatch = trimmed.match(
    /(\w+)\s*=\s*CanvasWorld\(\[([^\]]*)\]\)/
  )
  if (worldMatch) {
    const inner = worldMatch[2]!.trim()
    const newInner = inner ? `${inner}, ${varName}` : varName
    let next = trimmed.replace(
      worldMatch[0],
      `${worldMatch[1]} = CanvasWorld([${newInner}])`
    )
    if (!new RegExp(`^\\s*${escapeRegExp(varName)}\\s*=`, "m").test(next)) {
      next = `${next.trimEnd()}\n${assignment}`
    }
    return next
  }

  // Fallback: inject into root = Stack([...])
  const stackMatch = trimmed.match(/root\s*=\s*Stack\(\[([^\]]*)\]\)/)
  if (stackMatch) {
    const inner = stackMatch[1]!.trim()
    // Upgrade to CanvasWorld if not already structured that way
    if (!/CanvasWorld\(/.test(trimmed)) {
      return `root = Stack([world])
world = CanvasWorld([${inner ? `${inner}, ${varName}` : varName}])
${trimmed
  .split("\n")
  .filter((line) => !/^\s*root\s*=/.test(line))
  .join("\n")
  .trimEnd()}
${assignment}`
    }
    const newInner = inner ? `${inner}, ${varName}` : varName
    let next = trimmed.replace(
      stackMatch[0],
      `root = Stack([${newInner}])`
    )
    if (!new RegExp(`^\\s*${escapeRegExp(varName)}\\s*=`, "m").test(next)) {
      next = `${next.trimEnd()}\n${assignment}`
    }
    return next
  }

  return `root = Stack([world])
world = CanvasWorld([__prev, ${varName}])
__prev = TextContent("Board", "large-heavy")
${assignment}`
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function openuiFromPatchData(data: unknown): string {
  if (typeof data === "string") return data
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    if (typeof obj.openui === "string") return obj.openui
    if (typeof obj.fragment === "string") return obj.fragment
  }
  return `TextContent("${"Dashboard"}", "large-heavy")`
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean)
  if (!parts.length) return
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!
    const next = cur[key]
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[key] = {}
    }
    cur = cur[key] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]!] = value
}

/** Normalize patch data into widget props (openui slots use props.openui). */
export function coerceWidgetProps(
  kind: WidgetKind | undefined,
  data: unknown
): Record<string, unknown> {
  if (data == null) return {}
  if (typeof data === "string") {
    return kind === "openui" || !kind ? { openui: data } : { value: data }
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    if (
      (kind === "openui" || obj.openui != null) &&
      typeof obj.openui !== "string" &&
      typeof obj.fragment === "string"
    ) {
      return { ...obj, openui: obj.fragment }
    }
    return obj
  }
  return { value: data }
}

/** OpenUI Lang fragment for a named slot, if present. */
export function getSlotOpenui(
  model: CanvasModel | null | undefined,
  slotId: string
): { openui: string; updatedAt: string; x?: number; y?: number } | null {
  const w = model?.widgets?.[slotId]
  const fromShell = listSlotPlacementsFromShell(model?.openuiDocument).find(
    (p) => p.id === slotId
  )
  const openui =
    typeof w?.props.openui === "string"
      ? w.props.openui
      : typeof w?.props.fragment === "string"
        ? w.props.fragment
        : null
  const x =
    typeof w?.props.x === "number"
      ? w.props.x
      : fromShell?.x
  const y =
    typeof w?.props.y === "number"
      ? w.props.y
      : fromShell?.y
  if (!openui?.trim() && x == null && y == null && !w) return null
  return {
    openui: openui?.trim() ? openui : "",
    // Never invent timestamps — a fresh ISO on each call remounts OpenUI Renderers
    updatedAt: w?.updatedAt || "0",
    x,
    y,
  }
}

/**
 * Rewrite CanvasSlot("id", …) coordinates in the shell document.
 */
export function moveCanvasSlotInShell(
  doc: string | null | undefined,
  slotId: string,
  x: number,
  y: number
): string {
  const trimmed = doc?.trim() ?? ""
  if (!trimmed) {
    return injectCanvasSlotIntoShell(null, slotId, x, y)
  }
  const re = new RegExp(
    `CanvasSlot\\(\\s*"${escapeRegExp(slotId)}"\\s*(?:,\\s*-?\\d+(?:\\.\\d+)?\\s*,\\s*-?\\d+(?:\\.\\d+)?\\s*)?\\)`,
    "g"
  )
  if (re.test(trimmed)) {
    return trimmed.replace(
      re,
      `CanvasSlot("${slotId}", ${Math.round(x)}, ${Math.round(y)})`
    )
  }
  return injectCanvasSlotIntoShell(trimmed, slotId, x, y)
}

/** True when the named openui slot has no fragment yet. */
export function isOpenuiSlotEmpty(
  model: CanvasModel | null | undefined,
  slotId: string
): boolean {
  const slot = getSlotOpenui(model, slotId)
  return !slot?.openui?.trim()
}

/**
 * Ensure a slot fragment is a valid OpenUI program for Renderer.
 * Accepts either a full `root = ...` program or a single expression / assignments.
 */
function stripThesysFraming(content: string): string {
  const frame = "]]" + ">"
  const contentMark = frame + "openui:content"
  const endMark = frame + "openui:end"
  let text = content.replace(/\r\n/g, "\n")

  const parts: string[] = []
  let searchFrom = 0
  while (searchFrom < text.length) {
    const start = text.indexOf(contentMark, searchFrom)
    if (start < 0) break
    const afterHeaderNl = text.indexOf("\n", start)
    if (afterHeaderNl < 0) break
    const bodyStart = afterHeaderNl + 1
    const nextContent = text.indexOf(contentMark, bodyStart)
    const nextEnd = text.indexOf(endMark, bodyStart)
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

  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim()
      return !(
        t.startsWith(contentMark) ||
        t.startsWith(endMark) ||
        t === "```" ||
        /^```(?:openui-lang|openui|lang)?$/i.test(t)
      )
    })
    .join("\n")
    .trim()
}

export function normalizeSlotOpenui(fragment: string): string {
  const t = stripThesysFraming(fragment)
  if (!t) return "root = Stack([])"
  if (/^\s*root\s*=/.test(t)) return t
  return `root = Stack([__bloom_slot])\n__bloom_slot = ${t}`
}

export function applyCanvasPatch(
  model: CanvasModel,
  patch: CanvasPatchOp
): CanvasModel {
  const next: CanvasModel = {
    ...model,
    layout: [...model.layout],
    widgets: { ...model.widgets },
    revision: model.revision + 1,
  }
  const now = new Date().toISOString()

  switch (patch.op) {
    case "full": {
      if (patch.layout) next.layout = patch.layout
      if (patch.widgets) next.widgets = patch.widgets
      if (patch.openuiDocument !== undefined) {
        next.openuiDocument = patch.openuiDocument
      }
      break
    }
    case "replace": {
      if (!patch.widgetId) break
      const kind =
        patch.kind ||
        next.widgets[patch.widgetId]?.kind ||
        ("custom" as WidgetKind)
      next.widgets[patch.widgetId] = {
        kind,
        props: coerceWidgetProps(kind, patch.data),
        updatedAt: now,
      }
      if (!next.layout.some((l) => l.id === patch.widgetId)) {
        next.layout.push({
          id: patch.widgetId,
          kind,
          region: patch.region,
        })
      }
      // Ensure shell has a CanvasSlot so the panel is visible on the board
      if (
        kind === "openui" &&
        patch.widgetId !== "_live" &&
        !listSlotPlacementsFromShell(next.openuiDocument).some(
          (p) => p.id === patch.widgetId
        )
      ) {
        const occupied = listSlotPlacementsFromShell(next.openuiDocument).length
        const pos =
          patch.x != null && patch.y != null
            ? { x: patch.x, y: patch.y }
            : nextDashboardPosition(occupied)
        next.openuiDocument = injectCanvasSlotIntoShell(
          next.openuiDocument,
          patch.widgetId,
          pos.x,
          pos.y
        )
      }
      break
    }
    case "set": {
      if (!patch.widgetId) break
      const existing = next.widgets[patch.widgetId] || {
        kind: patch.kind || "custom",
        props: {},
        updatedAt: now,
      }
      const props = { ...existing.props }
      if (patch.path) {
        setPath(props, patch.path, patch.data)
      } else if (typeof patch.data === "string") {
        Object.assign(props, coerceWidgetProps(existing.kind, patch.data))
      } else if (patch.data && typeof patch.data === "object") {
        Object.assign(props, coerceWidgetProps(existing.kind, patch.data))
      }
      next.widgets[patch.widgetId] = {
        ...existing,
        kind: patch.kind || existing.kind,
        props,
        updatedAt: now,
      }
      if (!next.layout.some((l) => l.id === patch.widgetId)) {
        next.layout.push({
          id: patch.widgetId,
          kind: patch.kind || existing.kind,
          region: patch.region,
        })
      }
      break
    }
    case "insert": {
      if (!patch.widgetId || !patch.kind) break
      next.widgets[patch.widgetId] = {
        kind: patch.kind,
        props: coerceWidgetProps(patch.kind, patch.data),
        updatedAt: now,
      }
      if (!next.layout.some((l) => l.id === patch.widgetId)) {
        next.layout.push({
          id: patch.widgetId,
          kind: patch.kind,
          region: patch.region,
        })
      }
      break
    }
    case "remove": {
      if (!patch.widgetId) break
      delete next.widgets[patch.widgetId]
      next.layout = next.layout.filter((l) => l.id !== patch.widgetId)
      break
    }
    case "add_dashboard": {
      if (!patch.widgetId) break
      let pos: { x: number; y: number }
      if (patch.openuiDocument != null) {
        next.openuiDocument = patch.openuiDocument
        const placements = listSlotPlacementsFromShell(next.openuiDocument)
        const found = placements.find((p) => p.id === patch.widgetId)
        pos =
          patch.x != null && patch.y != null
            ? { x: patch.x, y: patch.y }
            : found
              ? { x: found.x, y: found.y }
              : nextDashboardPosition(placements.length)
      } else {
        const placements = listSlotPlacementsFromShell(next.openuiDocument)
        pos =
          patch.x != null && patch.y != null
            ? { x: patch.x, y: patch.y }
            : nextDashboardPosition(placements.length)
        next.openuiDocument = injectCanvasSlotIntoShell(
          next.openuiDocument,
          patch.widgetId,
          pos.x,
          pos.y
        )
      }
      const openui = openuiFromPatchData(patch.data)
      next.widgets[patch.widgetId] = {
        kind: "openui",
        props: { openui, x: pos.x, y: pos.y },
        updatedAt: now,
      }
      if (!next.layout.some((l) => l.id === patch.widgetId)) {
        next.layout.push({
          id: patch.widgetId,
          kind: "openui",
          region: patch.region,
        })
      }
      break
    }
    case "move": {
      if (!patch.widgetId || patch.x == null || patch.y == null) break
      const x = Math.round(patch.x)
      const y = Math.round(patch.y)
      next.openuiDocument = moveCanvasSlotInShell(
        next.openuiDocument,
        patch.widgetId,
        x,
        y
      )
      const existing = next.widgets[patch.widgetId]
      next.widgets[patch.widgetId] = {
        kind: existing?.kind || "openui",
        props: {
          ...(existing?.props || {}),
          x,
          y,
        },
        updatedAt: now,
      }
      if (!next.layout.some((l) => l.id === patch.widgetId)) {
        next.layout.push({
          id: patch.widgetId,
          kind: existing?.kind || "openui",
          region: patch.region,
        })
      }
      break
    }
  }

  return next
}
