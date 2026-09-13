"use client"

import { useCallback, useEffect, useState } from "react"
import { LogOut, RefreshCw, Settings } from "lucide-react"
import { usePrivy } from "@privy-io/react-auth"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AgentMode } from "@/lib/types"

type SettingsPopoverProps = {
  email?: string | null
  walletLabel?: string | null
  walletAddress?: string | null
  onLogout: () => void
}

type BalancePayload = {
  chainId: number
  chainName: string
  nativeDisplay: string
  usdcDisplay: string | null
  error?: string
}

export function SettingsPopover({
  email,
  walletLabel,
  walletAddress,
  onLogout,
}: SettingsPopoverProps) {
  const { getAccessToken } = usePrivy()
  const [open, setOpen] = useState(false)
  const [agentMode, setAgentMode] = useState<AgentMode>("human_mediated")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<BalancePayload | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  const loadBalance = useCallback(async () => {
    if (!walletAddress) {
      setBalance(null)
      setBalanceError("No wallet linked")
      return
    }
    setBalanceLoading(true)
    setBalanceError(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Not authenticated")
      const res = await fetch(
        `/api/wallet/balance?chainId=1&address=${encodeURIComponent(walletAddress)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load balance")
      setBalance({
        chainId: data.chainId,
        chainName: data.chainName,
        nativeDisplay: data.nativeDisplay,
        usdcDisplay: data.usdcDisplay,
      })
    } catch (e) {
      setBalance(null)
      setBalanceError(e instanceof Error ? e.message : "Balance unavailable")
    } finally {
      setBalanceLoading(false)
    }
  }, [getAccessToken, walletAddress])

  const loadSettings = useCallback(async () => {
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.agentMode === "autonomous" || data.agentMode === "human_mediated") {
        setAgentMode(data.agentMode)
      }
    } catch {
      // ignore load errors in popover
    }
  }, [getAccessToken])

  useEffect(() => {
    if (!open) return
    void loadSettings()
    void loadBalance()
  }, [open, loadSettings, loadBalance])

  const updateMode = async (mode: AgentMode) => {
    setSaving(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Not authenticated")
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentMode: mode,
          // Step-up: server requires explicit confirmation for autonomous escalation
          ...(mode === "autonomous" ? { confirmEscalation: true } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.requiresConfirmation) {
          throw new Error("Please confirm you want to enable autonomous mode")
        }
        throw new Error(data.error || "Failed to update settings")
      }
      setAgentMode(mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <Button
        onClick={() => setOpen((v) => !v)}
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
          agentMode === "autonomous" && "ring-1 ring-amber-500/50"
        )}
        aria-label="Settings"
        aria-expanded={open}
      >
        <Settings className="h-4 w-4" />
      </Button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
            <div className="mb-3 border-b border-border pb-2">
              <p className="truncate text-sm font-medium">{email || "Account"}</p>
              {walletLabel && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  {walletLabel}
                </p>
              )}
              {agentMode === "autonomous" && (
                <p className="mt-1 text-[10px] uppercase tracking-wide text-amber-400">
                  Autonomous on
                </p>
              )}
            </div>

            <div className="mb-3 rounded-lg border border-border/80 bg-muted/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Wallet balance
                </p>
                <button
                  type="button"
                  onClick={() => void loadBalance()}
                  disabled={balanceLoading}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label="Refresh balance"
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", balanceLoading && "animate-spin")}
                  />
                </button>
              </div>
              {balanceLoading && !balance ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : balance ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{balance.nativeDisplay}</p>
                  {balance.usdcDisplay && (
                    <p className="text-sm text-muted-foreground">
                      {balance.usdcDisplay}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {balance.chainName}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-destructive">
                  {balanceError || "Balance unavailable"}
                </p>
              )}
            </div>

            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Agent mode
            </p>
            <div className="mb-3 space-y-1.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => updateMode("human_mediated")}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  agentMode === "human_mediated"
                    ? "border-foreground/30 bg-muted"
                    : "border-transparent hover:bg-muted/60"
                )}
              >
                Confirm before signing
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  You approve each trade in the UI
                </span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => updateMode("autonomous")}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  agentMode === "autonomous"
                    ? "border-amber-500/40 bg-muted"
                    : "border-transparent hover:bg-muted/60"
                )}
              >
                Allow agent to execute
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Agent may sign after preparing calldata
                </span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  setError(null)
                  try {
                    const token = await getAccessToken()
                    if (!token) throw new Error("Not authenticated")
                    const res = await fetch("/api/missions", {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        action: "kill_switch",
                        killSwitch: true,
                      }),
                    })
                    if (!res.ok) throw new Error("Failed to engage kill switch")
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Kill switch failed")
                  } finally {
                    setSaving(false)
                  }
                }}
                className="w-full rounded-lg border border-destructive/40 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                Kill switch — pause all missions
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Immediately pauses autonomous activity
                </span>
              </button>
            </div>

            {error && (
              <p className="mb-2 text-xs text-destructive">{error}</p>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
