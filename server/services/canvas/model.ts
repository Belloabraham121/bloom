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
  op: "set" | "replace" | "insert" | "remove" | "full"
  widgetId?: string
  path?: string
  data?: unknown
  kind?: WidgetKind
  region?: string
  openuiDocument?: string | null
  layout?: CanvasLayoutItem[]
  widgets?: Record<string, WidgetState>
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
): { openui: string; updatedAt: string } | null {
  const w = model?.widgets?.[slotId]
  if (!w) return null
  const openui =
    typeof w.props.openui === "string"
      ? w.props.openui
      : typeof w.props.fragment === "string"
        ? w.props.fragment
        : null
  if (!openui?.trim()) return null
  return { openui, updatedAt: w.updatedAt }
}

/**
 * Ensure a slot fragment is a valid OpenUI program for Renderer.
 * Accepts either a full `root = ...` program or a single expression / assignments.
 */
function stripThesysFraming(content: string): string {
  let text = content.replace(/\r\n/g, "\n")
  const framed = [
    ...text.matchAll(
      /\]\]>openui:content[^\n]*\n([\s\S]*?)(?=\]\]>openui:content|\]\]>openui:end|$)/gi
    ),
  ]
  if (framed.length > 0) {
    const withRoot = [...framed].reverse().find((m) => /\broot\s*=/.test(m[1]))
    text = (withRoot ?? framed[framed.length - 1])[1]
  }
  return text
    .replace(/\]\]>openui:(?:content|end)[^\n]*/gi, "")
    .replace(/^```(?:openui-lang|openui|lang)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
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
  }

  return next
}
