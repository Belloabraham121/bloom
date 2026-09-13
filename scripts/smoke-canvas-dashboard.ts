import {
  applyCanvasPatch,
  emptyCanvas,
  injectCanvasSlotIntoShell,
  listSlotPlacementsFromShell,
  DEFAULT_SPATIAL_SHELL_OPENUI,
} from "../server/services/canvas/model"

const shell = DEFAULT_SPATIAL_SHELL_OPENUI
const placements = listSlotPlacementsFromShell(shell)
if (placements.length !== 2) {
  throw new Error(`expected 2 placements, got ${placements.length}`)
}

const withBal = injectCanvasSlotIntoShell(shell, "balances", 1000, 80)
if (!withBal.includes('CanvasSlot("balances", 1000, 80)')) {
  throw new Error("inject failed:\n" + withBal)
}

let m = emptyCanvas(null)
m = applyCanvasPatch(m, { op: "full", openuiDocument: shell })
m = applyCanvasPatch(m, {
  op: "add_dashboard",
  widgetId: "balances",
  data: { openui: 'BalanceBoard("Balances", "[]")' },
})

if (!m.widgets.balances?.props.openui) {
  throw new Error("balances widget missing")
}
if (!m.openuiDocument?.includes('CanvasSlot("balances"')) {
  throw new Error("shell missing balances slot:\n" + m.openuiDocument)
}

console.log("smoke-canvas-dashboard: ok")
