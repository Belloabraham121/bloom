import type { PublicDemoSession } from "./simulation";

export type DemoPanelKind = "graph" | "swap" | "liquidity" | "balances" | "tape";

type SeedDashboard = {
  slotId: string;
  x: number;
  y: number;
  openui: string;
};

function slotIdForFeed(feedId: string): string {
  return `demo_${feedId.toLowerCase()}`;
}

function sanitizeSlotId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64) || "demo-panel";
}

function sanitizeSide(value: unknown): "buy" | "sell" {
  return value === "sell" ? "sell" : "buy";
}

function sanitizeAmount(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : fallback;
  return /^\d+(\.\d+)?$/.test(text) ? text : fallback;
}

/** Strict desk grid: 3 columns, uniform rows. Panels never overlap. */
const GRID_X = [40, 520, 1000];
const GRID_Y0 = 80;
const GRID_ROWH = 560;

function columnForKind(kind: DemoPanelKind): number {
  if (kind === "graph") return 0;
  if (kind === "balances" || kind === "tape") return 1;
  return 2;
}

function classifyDemoSlot(openui: string): number {
  if (/DemoMarketTick|DemoMarketChart/.test(openui)) return 0;
  if (/DemoBalanceBoard|DemoTradeTape/.test(openui)) return 1;
  return 2;
}

/** Next free cell in a column, below the lowest placed panel there. */
function nextGridPosition(
  placements: Array<{ id: string; x: number; y: number }>,
  column: number
): { x: number; y: number } {
  const inColumn = placements.filter((p) =>
    Math.abs(p.x - GRID_X[column]!) < GRID_X[1]! - GRID_X[0]!
  );
  const y = inColumn.length
    ? Math.max(...inColumn.map((p) => p.y)) + GRID_ROWH
    : GRID_Y0;
  return { x: GRID_X[column]!, y };
}

export function buildDemoMarketFragment(feedId: string, pair: string): string {
  return [
    `Stack([title, tick, chart, controls])`,
    `title = TextContent("${pair}", "large-heavy")`,
    `tick = DemoMarketTick(feedId="${feedId}", title="Market")`,
    `chart = DemoMarketChart(feedId="${feedId}", title="Price chart")`,
    `controls = DemoFeedControls(feedId="${feedId}")`,
  ].join("\n");
}

export function buildDemoSwapFragment(feedId: string, side: "buy" | "sell" = "buy", amount = "2"): string {
  return [
    `Stack([title, status])`,
    `title = TextContent("Trade", "large-heavy")`,
    `status = DemoExecution(feedId="${feedId}", title="Execution", side="${side}", amount="${amount}")`,
  ].join("\n");
}

export function buildDemoLiquidityFragment(feedId: string, usdcAmount = "2"): string {
  return [
    `Stack([title, position])`,
    `title = TextContent("Liquidity", "large-heavy")`,
    `position = DemoLiquidity(feedId="${feedId}", title="Liquidity", usdcAmount="${usdcAmount}")`,
  ].join("\n");
}

export function buildDemoBalancesFragment(): string {
  return [
    `Stack([title, board])`,
    `title = TextContent("Portfolio", "large-heavy")`,
    `board = DemoBalanceBoard(title="Portfolio")`,
  ].join("\n");
}

export function buildDemoTapeFragment(): string {
  return [
    `Stack([title, tape])`,
    `title = TextContent("Trades", "large-heavy")`,
    `tape = DemoTradeTape(title="Trades")`,
  ].join("\n");
}

function marketSlot(feedId: string, pair: string, x: number, y: number): SeedDashboard {
  return {
    slotId: slotIdForFeed(feedId),
    x,
    y,
    openui: buildDemoMarketFragment(feedId, pair),
  };
}

export async function seedDemoDashboards(params: {
  userId: string;
  conversationId: string | null;
  session: PublicDemoSession;
}): Promise<void> {
  const { patchCanvasForUser, getCanvasModel } = await import("@/server/services/canvas/store");
  const { listSlotPlacementsFromShell } = await import(
    "@/server/services/canvas/model"
  );
  const canvas = await getCanvasModel(params.userId, params.conversationId);
  const dashboards: SeedDashboard[] = [];
  // Strict 3×2 grid: graphs across the top row, portfolio/execution/tape below.
  const positions = [
    { x: GRID_X[0]!, y: GRID_Y0 },
    { x: GRID_X[1]!, y: GRID_Y0 },
    { x: GRID_X[2]!, y: GRID_Y0 },
    { x: GRID_X[0]!, y: GRID_Y0 + GRID_ROWH },
    { x: GRID_X[1]!, y: GRID_Y0 + GRID_ROWH },
    { x: GRID_X[2]!, y: GRID_Y0 + GRID_ROWH },
  ];

  params.session.feedOrder.slice(0, 3).forEach((feedId, index) => {
    const feed = params.session.feeds[feedId];
    if (!feed) return;
    const position = positions[index] || { x: 40, y: 80 };
    dashboards.push(marketSlot(feed.feedId, `${feed.symbol1}/${feed.symbol0}`, position.x, position.y));
  });
  dashboards.push({
    slotId: "demo_balances",
    x: positions[3]?.x || 40,
    y: positions[3]?.y || 560,
    openui: buildDemoBalancesFragment(),
  });
  dashboards.push({
    slotId: "demo_execution",
    x: positions[4]?.x || 520,
    y: positions[4]?.y || 560,
    openui: buildDemoSwapFragment(params.session.feedOrder[0] || "USDC_ETH", "buy", "2"),
  });
  dashboards.push({
    slotId: "demo_tape",
    x: positions[5]?.x || 1000,
    y: positions[5]?.y || 560,
    openui: buildDemoTapeFragment(),
  });

  if (!canvas.openuiDocument?.trim()) {
    const children = ["title", ...dashboards.map((dashboard, index) => `panel${index}`)];
    const assignments = dashboards
      .map((dashboard, index) => `panel${index} = CanvasSlot("${dashboard.slotId}", ${dashboard.x}, ${dashboard.y})`)
      .join("\n");
    await patchCanvasForUser({
      userId: params.userId,
      conversationId: params.conversationId,
      patch: {
        op: "full",
        openuiDocument: [
          `root = Stack([world])`,
          `world = CanvasWorld([${children.join(", ")}])`,
          `title = TextContent("Trading desk", "large-heavy")`,
          assignments,
        ].join("\n"),
      },
    });
  } else {
    const placements = listSlotPlacementsFromShell(canvas.openuiDocument);
    for (const dashboard of dashboards) {
      if (placements.some((placement) => placement.id === dashboard.slotId)) continue;
      const column = classifyDemoSlot(dashboard.openui);
      const position = nextGridPosition(placements, column);
      await patchCanvasForUser({
        userId: params.userId,
        conversationId: params.conversationId,
        patch: {
          op: "add_dashboard",
          widgetId: dashboard.slotId,
          x: position.x,
          y: position.y,
          data: { openui: dashboard.openui },
        },
      });
      placements.push({ id: dashboard.slotId, x: position.x, y: position.y });
    }
  }

  for (const dashboard of dashboards) {
    await patchCanvasForUser({
      userId: params.userId,
      conversationId: params.conversationId,
      patch: {
        op: "replace",
        widgetId: dashboard.slotId,
        kind: "openui",
        data: { openui: dashboard.openui },
      },
    });
  }
}

export async function addDemoPanelService(params: {
  userId: string;
  conversationId: string | null;
  session: PublicDemoSession;
  kind: DemoPanelKind;
  feedId?: string;
  side?: unknown;
  amount?: unknown;
  usdcAmount?: unknown;
}): Promise<{ slotId: string; x: number; y: number }> {
  const { patchCanvasForUser, getCanvasModel } = await import("@/server/services/canvas/store");
  const { listSlotPlacementsFromShell } = await import("@/server/services/canvas/model");
  const feedId = (params.feedId || params.session.feedOrder[0] || "USDC_ETH").toUpperCase();
  const feed = params.session.feeds[feedId];
  if ((params.kind === "graph" || params.kind === "swap" || params.kind === "liquidity") && !feed) {
    throw Object.assign(new Error(`Unknown feed "${feedId}"`), { status: 400 });
  }
  const side = sanitizeSide(params.side);
  const amount = sanitizeAmount(params.amount, "2");
  const usdcAmount = sanitizeAmount(params.usdcAmount, "2");
  const slotId = sanitizeSlotId(
    `demo-panel-${params.kind}-${feedId.toLowerCase()}-${Date.now().toString(36)}`
  );
  const openui =
    params.kind === "graph"
      ? buildDemoMarketFragment(feedId, `${feed?.symbol1 || ""}/${feed?.symbol0 || ""}`)
      : params.kind === "swap"
        ? buildDemoSwapFragment(feedId, side, amount)
        : params.kind === "liquidity"
          ? buildDemoLiquidityFragment(feedId, usdcAmount)
          : params.kind === "balances"
            ? buildDemoBalancesFragment()
            : buildDemoTapeFragment();

  const canvas = await getCanvasModel(params.userId, params.conversationId);
  if (!canvas.openuiDocument?.trim()) {
    const x = params.kind === "graph" ? 40 : 1000;
    await patchCanvasForUser({
      userId: params.userId,
      conversationId: params.conversationId,
      patch: {
        op: "full",
        openuiDocument: [
          `root = Stack([world])`,
          `world = CanvasWorld([title, panel])`,
          `title = TextContent("Trading desk", "large-heavy")`,
          `panel = CanvasSlot("${slotId}", ${x}, 80)`,
        ].join("\n"),
      },
    });
    return { slotId, x, y: 80 };
  }

  const placements = listSlotPlacementsFromShell(canvas.openuiDocument);
  const position = nextGridPosition(placements, columnForKind(params.kind));
  const { x, y } = position;
  await patchCanvasForUser({
    userId: params.userId,
    conversationId: params.conversationId,
    patch: {
      op: "add_dashboard",
      widgetId: slotId,
      x,
      y,
      data: { openui },
    },
  });
  return { slotId, x, y };
}

/**
 * Re-grid every desk panel into the strict 3-column layout. Graphs stack in
 * the left column, portfolio/tape in the middle, trade modules on the right.
 */
export async function arrangeDemoPanelsService(params: {
  userId: string;
  conversationId: string | null;
}): Promise<{ moved: number }> {
  const { patchCanvasForUser, getCanvasModel } = await import("@/server/services/canvas/store");
  const canvas = await getCanvasModel(params.userId, params.conversationId);
  if (!canvas.openuiDocument?.trim()) return { moved: 0 };
  const counters = [0, 0, 0];
  let moved = 0;
  const targets: Array<{ slotId: string; x: number; y: number }> = [];
  for (const widgetId of Object.keys(canvas.widgets)) {
    if (!widgetId.startsWith("demo")) continue;
    const props = canvas.widgets[widgetId]?.props as { openui?: unknown } | undefined;
    const openui = typeof props?.openui === "string" ? props.openui : "";
    const column = classifyDemoSlot(openui);
    const row = counters[column] || 0;
    counters[column] = row + 1;
    targets.push({ slotId: widgetId, x: GRID_X[column]!, y: GRID_Y0 + row * GRID_ROWH });
  }
  for (const target of targets) {
    await patchCanvasForUser({
      userId: params.userId,
      conversationId: params.conversationId,
      patch: { op: "move", widgetId: target.slotId, x: target.x, y: target.y },
    });
    moved += 1;
  }
  return { moved };
}
