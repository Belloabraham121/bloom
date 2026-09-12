"use client"

import type { ReactNode } from "react"
import { createLibrary, defineComponent } from "@openuidev/react-lang"
import type { ComponentGroup, PromptOptions } from "@openuidev/react-lang"
import {
  openuiComponentGroups,
  openuiLibrary,
  openuiPromptOptions,
} from "@openuidev/react-ui/genui-lib"
import { z } from "zod/v4"
import { useLiveFeed, useCanvasSlot } from "@/components/chat/live-feed-context"
import { AnimatedOrb } from "@/components/chat/animated-orb"
import { Button } from "@/components/ui/button"
import { Pause, Play, Square } from "lucide-react"
import { Renderer } from "@openuidev/react-lang"
import { normalizeSlotOpenui } from "@/server/services/canvas/model"

function CardShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="my-2 w-full rounded-xl border border-border bg-card/80 p-4 text-card-foreground shadow-sm">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  )
}

const MessageText = defineComponent({
  name: "MessageText",
  description:
    "Short trading caption only (greetings or one-line intro). Prefer TextContent for general copy. Max two sentences.",
  props: z.object({
    text: z.string(),
  }),
  component: ({ props }) => (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
      {props.text}
    </p>
  ),
})

const TokenRow = defineComponent({
  name: "TokenRow",
  description:
    "One token row: symbol, name, optional contract address and logoUrl (Uniswap or CoinGecko).",
  props: z.object({
    symbol: z.string(),
    name: z.string(),
    address: z.string().optional(),
    logoUrl: z.string().optional(),
  }),
  component: ({ props }) => (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        {props.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.logoUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full bg-muted object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
            aria-hidden
          >
            {props.symbol.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{props.symbol}</p>
          <p className="truncate text-xs text-muted-foreground">{props.name}</p>
        </div>
      </div>
      {props.address && (
        <p className="max-w-[9rem] shrink-0 truncate font-mono text-[10px] text-muted-foreground">
          {props.address}
        </p>
      )}
    </div>
  ),
})

const TokenList = defineComponent({
  name: "TokenList",
  description:
    "Visual list of tokens (bridgable, searchable, or swappable). Prefer over markdown bullets for token discovery.",
  props: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    children: z.array(TokenRow.ref),
  }),
  component: ({ props, renderNode }) => (
    <CardShell title={props.title}>
      {props.subtitle && (
        <p className="mb-2 text-xs text-muted-foreground">{props.subtitle}</p>
      )}
      <div className="max-h-72 overflow-y-auto pr-1">{renderNode(props.children)}</div>
    </CardShell>
  ),
})

const ChainRow = defineComponent({
  name: "ChainRow",
  description: "One supported chain row.",
  props: z.object({
    name: z.string(),
    chainId: z.string(),
  }),
  component: ({ props }) => (
    <div className="flex items-center justify-between border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-foreground">{props.name}</span>
      <span className="font-mono text-xs text-muted-foreground">
        {props.chainId}
      </span>
    </div>
  ),
})

const ChainList = defineComponent({
  name: "ChainList",
  description: "Visual list of supported chains.",
  props: z.object({
    title: z.string(),
    children: z.array(ChainRow.ref),
  }),
  component: ({ props, renderNode }) => (
    <CardShell title={props.title}>
      <div className="max-h-72 overflow-y-auto pr-1">{renderNode(props.children)}</div>
    </CardShell>
  ),
})

const QuoteSummary = defineComponent({
  name: "QuoteSummary",
  description: "Show a Uniswap quote: tokens, amounts, routing, and gas.",
  props: z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    amountOut: z.string(),
    routing: z.string(),
    gasFeeUsd: z.string().optional(),
    chainLabel: z.string().optional(),
  }),
  component: ({ props }) => (
    <CardShell title="Quote">
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">In</span> {props.amountIn}{" "}
          {props.tokenIn}
        </p>
        <p>
          <span className="text-muted-foreground">Out</span> {props.amountOut}{" "}
          {props.tokenOut}
        </p>
        <p>
          <span className="text-muted-foreground">Route</span> {props.routing}
        </p>
        {props.gasFeeUsd && (
          <p>
            <span className="text-muted-foreground">Network fee</span> ~$
            {props.gasFeeUsd}
          </p>
        )}
        {props.chainLabel && (
          <p className="text-xs text-muted-foreground">{props.chainLabel}</p>
        )}
      </div>
    </CardShell>
  ),
})

const ApprovalCard = defineComponent({
  name: "ApprovalCard",
  description: "Show token approval requirements before a swap or LP action.",
  props: z.object({
    token: z.string(),
    spender: z.string(),
    amount: z.string().optional(),
    status: z.string().optional(),
  }),
  component: ({ props }) => (
    <CardShell title="Approval">
      <div className="space-y-1 text-sm">
        <p>Token: {props.token}</p>
        <p className="break-all text-xs text-muted-foreground">
          Spender: {props.spender}
        </p>
        {props.amount && <p>Amount: {props.amount}</p>}
        {props.status && <p>Status: {props.status}</p>}
      </div>
    </CardShell>
  ),
})

const ConfirmTx = defineComponent({
  name: "ConfirmTx",
  description:
    "Ask the user to confirm broadcasting a prepared transaction or order.",
  props: z.object({
    title: z.string(),
    summary: z.string(),
    txTo: z.string().optional(),
    requiresConfirm: z.boolean().optional(),
  }),
  component: ({ props }) => (
    <CardShell title={props.title || "Confirm"}>
      <p className="text-sm">{props.summary}</p>
      {props.txTo && (
        <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
          to: {props.txTo}
        </p>
      )}
      {props.requiresConfirm !== false && (
        <p className="mt-3 text-xs text-amber-400/90">
          Confirm in chat or Settings → autonomous mode to auto-execute.
        </p>
      )}
    </CardShell>
  ),
})

const CostBreakdown = defineComponent({
  name: "CostBreakdown",
  description: "Show network gas cost for a trade (no platform fee).",
  props: z.object({
    networkFeeUsd: z.string(),
    note: z.string().optional(),
  }),
  component: ({ props }) => (
    <CardShell title="Cost">
      <p className="text-sm">Network fee ≈ ${props.networkFeeUsd}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {props.note || "Paid by your wallet. No Bloom platform fee."}
      </p>
    </CardShell>
  ),
})

const TxStatusCard = defineComponent({
  name: "TxStatusCard",
  description: "Show status of a swap, order, plan step, or LP transaction.",
  props: z.object({
    category: z.string(),
    status: z.string(),
    txHash: z.string().optional(),
    detail: z.string().optional(),
  }),
  component: ({ props }) => (
    <CardShell title="Status">
      <p className="text-sm">
        {props.category}: <span className="font-medium">{props.status}</span>
      </p>
      {props.txHash && (
        <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
          {props.txHash}
        </p>
      )}
      {props.detail && (
        <p className="mt-1 text-xs text-muted-foreground">{props.detail}</p>
      )}
    </CardShell>
  ),
})

const GaslessOrderCard = defineComponent({
  name: "GaslessOrderCard",
  description: "Summarize a UniswapX gasless order.",
  props: z.object({
    orderId: z.string().optional(),
    status: z.string(),
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    amountOut: z.string().optional(),
  }),
  component: ({ props }) => (
    <CardShell title="Gasless order">
      <div className="space-y-1 text-sm">
        <p>
          {props.amountIn} {props.tokenIn} → {props.amountOut || "?"}{" "}
          {props.tokenOut}
        </p>
        <p>Status: {props.status}</p>
        {props.orderId && (
          <p className="break-all text-[10px] text-muted-foreground">
            {props.orderId}
          </p>
        )}
      </div>
    </CardShell>
  ),
})

const ChainedPlanCard = defineComponent({
  name: "ChainedPlanCard",
  description: "Show a chained cross-chain execution plan overview.",
  props: z.object({
    planId: z.string(),
    status: z.string(),
    stepsSummary: z.string(),
  }),
  component: ({ props }) => (
    <CardShell title="Chained plan">
      <p className="text-sm">{props.stepsSummary}</p>
      <p className="mt-1 text-xs">Status: {props.status}</p>
      <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
        {props.planId}
      </p>
    </CardShell>
  ),
})

const LpPositionCard = defineComponent({
  name: "LpPositionCard",
  description: "Summarize an LP create/increase/decrease/claim action.",
  props: z.object({
    action: z.string(),
    pool: z.string(),
    detail: z.string().optional(),
  }),
  component: ({ props }) => (
    <CardShell title="Liquidity">
      <p className="text-sm">
        {props.action}: {props.pool}
      </p>
      {props.detail && (
        <p className="mt-1 text-xs text-muted-foreground">{props.detail}</p>
      )}
    </CardShell>
  ),
})

const PoolTelemetry = defineComponent({
  name: "PoolTelemetry",
  description:
    "Show pool TVL and volume from The Graph (include version + chain when known).",
  props: z.object({
    pair: z.string(),
    tvlUsd: z.string(),
    volumeUsd: z.string().optional(),
    feeTier: z.string().optional(),
    version: z.string().optional(),
    chain: z.string().optional(),
  }),
  component: ({ props }) => (
    <CardShell title="Pool">
      <p className="text-sm font-medium">{props.pair}</p>
      {(props.version || props.chain) && (
        <p className="text-xs text-muted-foreground">
          {[props.version?.toUpperCase(), props.chain].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="text-sm">TVL ${props.tvlUsd}</p>
      {props.volumeUsd && (
        <p className="text-sm">Volume ${props.volumeUsd}</p>
      )}
      {props.feeTier && (
        <p className="text-xs text-muted-foreground">Fee {props.feeTier}</p>
      )}
    </CardShell>
  ),
})

/** Legacy root — prefer Stack for new replies. */
const Root = defineComponent({
  name: "Root",
  description:
    "Legacy top-level container. Prefer Stack([...]) for new responses.",
  props: z.object({
    children: z.array(z.any()),
  }),
  component: ({ props, renderNode }) => (
    <div className="flex w-full flex-col gap-2">{renderNode(props.children)}</div>
  ),
})

function LiveActivityView({ title }: { title?: string }) {
  const { liveActive, working, events, missionAction } = useLiveFeed()
  const latest = events[0]
  return (
    <CardShell title={title || "Live agent activity"}>
      {!liveActive ? (
        <p className="text-xs text-muted-foreground">
          Waiting for live session… (ask again if this stays empty)
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <AnimatedOrb size={22} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                {working ? "Agent working" : "Agent idle"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {latest?.message || "Waiting for signals…"}
              </p>
            </div>
            <div className="flex gap-1">
              {working ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => void missionAction("pause")}
                  aria-label="Pause"
                >
                  <Pause className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => void missionAction("resume")}
                  aria-label="Resume"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void missionAction("stop")}
                aria-label="Stop"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {events.slice(0, 12).map((e, i) => (
              <div
                key={`${e.at}-${i}`}
                className="flex gap-2 text-[10px] text-muted-foreground"
              >
                <span className="shrink-0 font-mono text-foreground/70">
                  {e.step}
                </span>
                <span className="truncate">{e.message}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </CardShell>
  )
}

const LiveActivity = defineComponent({
  name: "LiveActivity",
  description:
    "Real-time agent activity panel (steps: quoting/signing/submitted). ONLY after start_market_watch or start_mission when the user asked for live/real-time. Not fixed chrome — place in Stack when live UI is needed.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: ({ props }) => <LiveActivityView title={props.title} />,
})

function LiveTradeTapeView({ title }: { title?: string }) {
  const { liveActive, tapeRows } = useLiveFeed()
  return (
    <CardShell title={title || "Live trade tape"}>
      {!liveActive ? (
        <p className="text-xs text-muted-foreground">Waiting for live session…</p>
      ) : tapeRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Waiting for trades…</p>
      ) : (
        <div className="max-h-40 overflow-y-auto">
          {tapeRows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 border-b border-border/30 py-1.5 text-[11px] last:border-0"
            >
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                {row.side || "swap"}
              </span>
              <span className="text-muted-foreground">{row.status}</span>
              {row.txHash && (
                <a
                  href={`https://etherscan.io/tx/${row.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto font-mono text-[10px] text-primary hover:underline"
                >
                  {row.txHash.slice(0, 10)}…
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}

const LiveTradeTape = defineComponent({
  name: "LiveTradeTape",
  description:
    "Scrolling live trade tape of agent swaps/LP. Emit only after start_market_watch / start_mission for real-time views.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: ({ props }) => <LiveTradeTapeView title={props.title} />,
})

function LiveMarketTickView({ title }: { title?: string }) {
  const { liveActive, lastTick } = useLiveFeed()
  return (
    <CardShell title={title || "Live market tick"}>
      {!liveActive || !lastTick ? (
        <p className="text-xs text-muted-foreground">
          {liveActive ? "Waiting for ticks…" : "Waiting for live session…"}
        </p>
      ) : (
        <p className="text-sm text-foreground">
          {String(lastTick.symbol0 || "")}/{String(lastTick.symbol1 || "")} ·{" "}
          {String(lastTick.price || "—")}
          {lastTick.pool ? (
            <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
              {String(lastTick.pool)}
            </span>
          ) : null}
        </p>
      )}
    </CardShell>
  )
}

const LiveMarketTick = defineComponent({
  name: "LiveMarketTick",
  description:
    "Latest live pool/price tick from the market bus. Use after start_market_watch when user wants real-time prices.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: ({ props }) => <LiveMarketTickView title={props.title} />,
})

function InflightTradeView({ title }: { title?: string }) {
  const { events, liveActive } = useLiveFeed()
  const inflight = events.find((e) =>
    ["quoting", "signing", "submitted", "deciding"].includes(e.step)
  )
  return (
    <CardShell title={title || "In-flight trade"}>
      {!liveActive ? (
        <p className="text-xs text-muted-foreground">No live session.</p>
      ) : !inflight ? (
        <p className="text-xs text-muted-foreground">No trade in flight.</p>
      ) : (
        <>
          <p className="text-sm capitalize text-foreground">{inflight.step}</p>
          <p className="mt-1 text-xs text-muted-foreground">{inflight.message}</p>
        </>
      )}
    </CardShell>
  )
}

const InflightTrade = defineComponent({
  name: "InflightTrade",
  description:
    "Single in-flight trade card (quoting → signing → submitted). Include in live Stack after start_mission / start_market_watch.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: ({ props }) => <InflightTradeView title={props.title} />,
})

/** Filled by createLibrary below — nested slot Renderer uses the same library. */
let bloomLibraryRef: ReturnType<typeof createLibrary> | null = null

function CanvasSlotView({ slotId }: { slotId: string }) {
  const slot = useCanvasSlot(slotId)
  const lib = bloomLibraryRef
  if (!slot?.openui) {
    return (
      <div className="my-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-4 text-center text-[11px] text-muted-foreground">
        Slot <span className="font-mono text-foreground/70">{slotId}</span> —
        waiting for patch_canvas…
      </div>
    )
  }
  if (!lib) {
    return (
      <div className="text-[11px] text-muted-foreground">Loading slot…</div>
    )
  }
  return (
    <div
      key={`${slotId}-${slot.updatedAt}`}
      className="w-full min-w-0 animate-in fade-in duration-150"
      data-canvas-slot={slotId}
    >
      <Renderer
        library={lib}
        response={normalizeSlotOpenui(slot.openui)}
        isStreaming={false}
      />
    </div>
  )
}

const CanvasSlot = defineComponent({
  name: "CanvasSlot",
  description:
    "Named OpenUI region for incremental canvas edits. Emit once in the shell Stack, then update via patch_canvas (kind=openui, widgetId=slotId, data.openui=fragment). Do NOT regenerate the whole Stack to change one panel.",
  props: z.object({
    slotId: z.string(),
  }),
  component: ({ props }) => <CanvasSlotView slotId={props.slotId} />,
})

const TRADING_COMPONENTS = [
  MessageText,
  TokenRow,
  TokenList,
  ChainRow,
  ChainList,
  QuoteSummary,
  ApprovalCard,
  ConfirmTx,
  CostBreakdown,
  TxStatusCard,
  GaslessOrderCard,
  ChainedPlanCard,
  LpPositionCard,
  PoolTelemetry,
  LiveActivity,
  LiveTradeTape,
  LiveMarketTick,
  InflightTrade,
  CanvasSlot,
  Root,
] as const

const tradingComponentGroup: ComponentGroup = {
  name: "Trading",
  components: TRADING_COMPONENTS.map((c) => c.name),
  notes: [
    "- Use Trading components for Uniswap quotes, approvals, confirms, LP, and pool TVL.",
    "- Incremental canvas: shell Stack with CanvasSlot(\"id\"); updates via patch_canvas kind=openui — never full redraw for small changes.",
    "- Real-time ONLY when user asks: start_market_watch then emit LiveActivity / LiveTradeTape / LiveMarketTick / InflightTrade in Stack.",
    "- Never assume live chrome exists outside OpenUI — the model must place Live* components.",
    "- Token discovery → TokenList + TokenRow. Chains → ChainList + ChainRow.",
    "- Prefer Button with Action([@ToAssistant(\"...\")]) for confirm / follow-up clicks.",
  ],
}

export const bloomPromptOptions: PromptOptions = {
  examples: [
    ...(openuiPromptOptions.examples ?? []),
    `Example — Uniswap quote + confirm:

root = Stack([caption, quote, cost, confirm])
caption = TextContent("Quote ready", "large-heavy")
quote = QuoteSummary("USDC", "WETH", "100", "0.04", "CLASSIC", "1.20", "Ethereum")
cost = CostBreakdown("1.20")
confirm = ConfirmTx("Confirm swap", "Swap 100 USDC for ~0.04 WETH on Ethereum", null, true)`,
    `Example — incremental canvas shell (first paint):

root = Stack([title, quote_slot, live_slot])
title = TextContent("Trading desk", "large-heavy")
quote_slot = CanvasSlot("quote")
live_slot = CanvasSlot("live")

Then call patch_canvas replace widgetId=quote kind=openui data={{openui: "QuoteSummary(...)"}}
and patch_canvas for live with LiveActivity / LiveTradeTape fragments. Later ticks: only patch_canvas — do not re-emit root Stack.`,
    `Example — live real-time terminal (after start_market_watch):

root = Stack([title, activity, tick, tape])
title = TextContent("Live USDC/ETH", "large-heavy")
activity = LiveActivity("Agent activity")
tick = LiveMarketTick("Last tick")
tape = LiveTradeTape("Trades")`,
    `Example — Pool TVL table + chart:

root = Stack([title, tbl, chart])
title = TextContent("Top Base V3 pools", "large-heavy")
tbl = Table([Col("Pair", pairs), Col("TVL (USD)", tvls)])
pairs = ["WETH/USDC", "WETH/USDbC"]
tvls = [12000000, 4500000]
chart = BarChart(pairs, [s1], "grouped")
s1 = Series("TVL", tvls)`,
  ],
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "Every program must start with root = Stack([...]). Do not use Root(...).",
    "Prefer CanvasSlot + patch_canvas for incremental updates; only emit a new full Stack for first paint or major layout changes.",
    "Live UI must be OpenUI LiveActivity / LiveTradeTape / LiveMarketTick / InflightTrade — never assume fixed chat chrome.",
    "Only after start_market_watch or start_mission when the user asked for real-time.",
    "For Uniswap trading flows prefer Trading components (QuoteSummary, ConfirmTx, TokenList, PoolTelemetry, etc.).",
    "For comparisons and analytics use Table, BarChart, LineChart, PieChart, etc.",
    "Buttons: use Button / Buttons with Action([@ToAssistant(\"message\")]) or @OpenUrl(\"https://...\").",
    "Never invent token addresses or chain IDs — call tools first.",
  ],
}

export const bloomLibrary = createLibrary({
  id: "bloom-trading@4",
  root: "Stack",
  componentGroups: [...openuiComponentGroups, tradingComponentGroup],
  components: [
    ...Object.values(openuiLibrary.components),
    ...TRADING_COMPONENTS,
  ],
})

bloomLibraryRef = bloomLibrary

export const bloomLibrarySpec = bloomLibrary.toSpec()
