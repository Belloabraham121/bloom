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

function CardShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="my-2 w-full max-w-lg rounded-xl border border-border bg-card/80 p-4 text-card-foreground shadow-sm">
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
  description: "One token row: symbol, name, optional contract address.",
  props: z.object({
    symbol: z.string(),
    name: z.string(),
    address: z.string().optional(),
  }),
  component: ({ props }) => (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.symbol}</p>
        <p className="truncate text-xs text-muted-foreground">{props.name}</p>
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
  Root,
] as const

const tradingComponentGroup: ComponentGroup = {
  name: "Trading",
  components: TRADING_COMPONENTS.map((c) => c.name),
  notes: [
    "- Use Trading components for Uniswap quotes, approvals, confirms, LP, and pool TVL.",
    "- Token discovery → TokenList + TokenRow. Chains → ChainList + ChainRow.",
    "- After get_pool_telemetry / get_top_pools → PoolTelemetry (and/or Table / BarChart for comparisons).",
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
    "For Uniswap trading flows prefer Trading components (QuoteSummary, ConfirmTx, TokenList, PoolTelemetry, etc.).",
    "For comparisons and analytics use Table, BarChart, LineChart, PieChart, etc.",
    "Buttons: use Button / Buttons with Action([@ToAssistant(\"message\")]) or @OpenUrl(\"https://...\").",
    "Never invent token addresses or chain IDs — call tools first.",
  ],
}

export const bloomLibrary = createLibrary({
  id: "bloom-trading@3",
  root: "Stack",
  componentGroups: [...openuiComponentGroups, tradingComponentGroup],
  components: [
    ...Object.values(openuiLibrary.components),
    ...TRADING_COMPONENTS,
  ],
})

export const bloomLibrarySpec = bloomLibrary.toSpec()
