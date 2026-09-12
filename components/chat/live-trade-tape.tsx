"use client"

import { cn } from "@/lib/utils"

export type TradeTapeRow = {
  id: string
  side?: string
  status?: string
  txHash?: string
  chainId?: number
  pair?: string
  size?: string
  at?: string
}

interface LiveTradeTapeProps {
  rows: TradeTapeRow[]
  className?: string
}

export function LiveTradeTape({ rows, className }: LiveTradeTapeProps) {
  if (!rows.length) return null

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border border-border/60 bg-card/40",
        className
      )}
    >
      <div className="border-b border-border/50 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Live trade tape
      </div>
      <div className="max-h-40 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 text-[11px] last:border-0 animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
              {row.side || "swap"}
            </span>
            <span className="text-muted-foreground">{row.status}</span>
            {row.pair && <span className="text-foreground/80">{row.pair}</span>}
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
    </div>
  )
}
