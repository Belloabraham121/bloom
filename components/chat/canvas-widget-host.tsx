"use client"

import { memo } from "react"
import type { WidgetKind, WidgetState } from "@/server/services/canvas/model"
import { LiveTradeTape, type TradeTapeRow } from "./live-trade-tape"
import { cn } from "@/lib/utils"

export type ClientCanvasModel = {
  layout: { id: string; kind: WidgetKind; region?: string }[]
  widgets: Record<string, WidgetState>
  openuiDocument?: string | null
  revision: number
}

function InflightCard({ props }: { props: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-3">
      <p className="text-xs font-medium text-foreground">In-flight trade</p>
      <p className="mt-1 text-sm capitalize text-muted-foreground">
        {String(props.status || "idle")}
      </p>
      {typeof props.txHash === "string" && (
        <p className="mt-1 font-mono text-[11px] text-foreground/80">
          {props.txHash}
        </p>
      )}
      {typeof props.error === "string" && (
        <p className="mt-1 text-xs text-destructive">{props.error}</p>
      )}
    </div>
  )
}

function WalletBalanceWidget({ props }: { props: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-sm">
      <p className="text-[10px] uppercase text-muted-foreground">Wallet</p>
      <p className="font-medium text-foreground">
        {String(props.display || props.usd || "—")}
      </p>
    </div>
  )
}

function PoolTickWidget({ props }: { props: Record<string, unknown> }) {
  const tick = props.lastTick as Record<string, unknown> | undefined
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-xs">
      <p className="text-[10px] uppercase text-muted-foreground">Last tick</p>
      <p className="text-foreground">
        {tick
          ? `${tick.symbol0 || ""}/${tick.symbol1 || ""} · ${tick.price || "—"}`
          : "—"}
      </p>
    </div>
  )
}

const WidgetView = memo(function WidgetView({
  id,
  state,
}: {
  id: string
  state: WidgetState
}) {
  if (state.kind === "inflight_trade") {
    return <InflightCard props={state.props} />
  }
  if (state.kind === "wallet_balance") {
    return <WalletBalanceWidget props={state.props} />
  }
  if (state.kind === "pool_table") {
    return <PoolTickWidget props={state.props} />
  }
  if (state.kind === "trade_tape") {
    const rowsObj = (state.props.rows || state.props) as Record<string, TradeTapeRow>
    const rows = Object.values(rowsObj).filter(
      (r) => r && typeof r === "object" && "id" in r
    ) as TradeTapeRow[]
    rows.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    return <LiveTradeTape rows={rows.slice(0, 30)} />
  }
  return (
    <div className="rounded-lg border border-dashed border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
      Widget <span className="font-mono text-foreground/70">{id}</span> (
      {state.kind})
    </div>
  )
})

interface CanvasWidgetHostProps {
  model: ClientCanvasModel | null
  className?: string
}

export function CanvasWidgetHost({ model, className }: CanvasWidgetHostProps) {
  if (!model?.layout?.length) return null

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {model.layout.map((item) => {
        const state = model.widgets[item.id]
        if (!state) return null
        return (
          <div key={`${item.id}-${state.updatedAt}`}>
            <WidgetView id={item.id} state={state} />
          </div>
        )
      })}
    </div>
  )
}
