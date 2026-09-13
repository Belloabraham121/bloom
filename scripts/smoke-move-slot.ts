import {
  applyCanvasPatch,
  emptyCanvas,
  listSlotPlacementsFromShell,
  moveCanvasSlotInShell,
  DEFAULT_SPATIAL_SHELL_OPENUI,
} from "../server/services/canvas/model"

const moved = moveCanvasSlotInShell(DEFAULT_SPATIAL_SHELL_OPENUI, "live", 120, 200)
if (!moved.includes('CanvasSlot("live", 120, 200)')) {
  throw new Error("move failed:\n" + moved)
}
if (!moved.includes('CanvasSlot("quote", 520, 80)')) {
  throw new Error("quote coords lost:\n" + moved)
}

let m = emptyCanvas(null)
m = applyCanvasPatch(m, {
  op: "full",
  openuiDocument: DEFAULT_SPATIAL_SHELL_OPENUI,
})
m = applyCanvasPatch(m, { op: "move", widgetId: "quote", x: 900, y: 140 })
const placements = listSlotPlacementsFromShell(m.openuiDocument)
const quote = placements.find((p) => p.id === "quote")
if (!quote || quote.x !== 900 || quote.y !== 140) {
  throw new Error("patch move failed: " + JSON.stringify(placements))
}
if (m.widgets.quote?.props.x !== 900) {
  throw new Error("widget props x not set")
}

console.log("smoke-move-slot: ok")
