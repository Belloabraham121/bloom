"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import type { LiveAgentStep } from "./agent-activity-dock"
import type { TradeTapeRow } from "./live-trade-tape"
import type { ClientCanvasModel } from "./canvas-widget-host"
import {
  applyCanvasPatch,
  emptyCanvas,
  type CanvasModel,
  type CanvasPatchOp,
  type WidgetKind,
} from "@/server/services/canvas/model"

function toClientModel(canvas: CanvasModel): ClientCanvasModel {
  return {
    layout: canvas.layout || [],
    widgets: canvas.widgets || {},
    openuiDocument: canvas.openuiDocument ?? null,
    revision: canvas.revision || 0,
  }
}

export function useMissionLive(opts: {
  conversationId?: string | null
  chainId?: number
  /** Bump after chat turns so we re-check live-status + canvas */
  refreshKey?: number | string
}) {
  const { getAccessToken } = usePrivy()
  const [liveActive, setLiveActive] = useState(false)
  const [agentEvents, setAgentEvents] = useState<LiveAgentStep[]>([])
  const [working, setWorking] = useState(false)
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [tapeRows, setTapeRows] = useState<TradeTapeRow[]>([])
  const [lastTick, setLastTick] = useState<Record<string, unknown> | null>(null)
  const [canvasModel, setCanvasModel] = useState<ClientCanvasModel | null>(null)
  const marketEsRef = useRef<EventSource | null>(null)
  const canvasEsRef = useRef<EventSource | null>(null)

  const applyPatchLocal = useCallback(
    (patch: CanvasPatchOp) => {
      setCanvasModel((prev) => {
        const base: CanvasModel = prev
          ? {
              conversationId: opts.conversationId ?? null,
              layout: prev.layout,
              widgets: prev.widgets,
              openuiDocument: prev.openuiDocument ?? null,
              revision: prev.revision,
            }
          : emptyCanvas(opts.conversationId ?? null)
        const next = applyCanvasPatch(base, patch)
        return toClientModel(next)
      })
    },
    [opts.conversationId]
  )

  const refreshCanvas = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return
    try {
      const canvasRes = await fetch(
        `/api/canvas?conversationId=${encodeURIComponent(opts.conversationId || "")}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (canvasRes.ok) {
        const data = await canvasRes.json()
        if (data.canvas) {
          setCanvasModel(toClientModel(data.canvas))
          const liveWidget = data.canvas.widgets?._live
          const props = liveWidget?.props as Record<string, unknown> | undefined
          if (props?.active) {
            setLiveActive(true)
            if (props.missionId) setActiveMissionId(String(props.missionId))
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, [getAccessToken, opts.conversationId])

  const refreshLiveStatus = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) {
      setLiveActive(false)
      return false
    }
    try {
      const res = await fetch("/api/missions/live-status", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setLiveActive(false)
        return false
      }
      const data = await res.json()
      const active = Boolean(data.active)
      setLiveActive(active)
      if (data.session?.missionId) {
        setActiveMissionId(String(data.session.missionId))
      } else if (Array.isArray(data.runningMissions) && data.runningMissions[0]) {
        setActiveMissionId(String(data.runningMissions[0].id))
        setWorking(true)
      }
      return active
    } catch {
      setLiveActive(false)
      return false
    }
  }, [getAccessToken])

  // Load canvas whenever conversation changes / after chat turns
  useEffect(() => {
    void refreshCanvas()
  }, [refreshCanvas, opts.refreshKey])

  // Poll live-status
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await refreshLiveStatus()
    })()
    const id = setInterval(() => {
      void refreshLiveStatus()
    }, 4_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [refreshLiveStatus, opts.refreshKey, opts.conversationId])

  // Always-on canvas patch SSE (incremental OpenUI slots)
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const token = await getAccessToken()
      if (!token || cancelled) return

      const url = `/api/canvas/live?conversationId=${encodeURIComponent(opts.conversationId || "")}&access_token=${encodeURIComponent(token)}`
      const es = new EventSource(url)
      canvasEsRef.current = es

      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            type: string
            op?: CanvasPatchOp["op"]
            widgetId?: string
            path?: string
            kind?: WidgetKind
            openuiDocument?: string | null
            data?: unknown
          }
          if (msg.type !== "canvas_patch" || !msg.op) return

          applyPatchLocal({
            op: msg.op,
            widgetId: msg.widgetId,
            path: msg.path,
            kind: msg.kind,
            openuiDocument: msg.openuiDocument,
            data: msg.data,
          })

          // start_market_watch publishes _live — flip liveActive without waiting on Redis/poll
          if (msg.widgetId === "_live") {
            const data = (msg.data || {}) as Record<string, unknown>
            if (data.active === false) {
              setLiveActive(false)
              setWorking(false)
            } else if (data.active) {
              setLiveActive(true)
              setWorking(true)
              if (data.missionId) setActiveMissionId(String(data.missionId))
              void refreshLiveStatus()
            }
          }

          if (msg.widgetId === "trade_tape" && msg.data) {
            const data = msg.data as Record<string, unknown>
            const row: TradeTapeRow = {
              id: String(msg.path || `${Date.now()}`),
              side: String(data.side || data.status || "swap"),
              status: String(data.status || "update"),
              txHash: data.txHash ? String(data.txHash) : undefined,
              chainId: Number(data.chainId || opts.chainId || 1),
              at: new Date().toISOString(),
            }
            setTapeRows((prev) => [row, ...prev].slice(0, 40))
          }
        } catch {
          /* ignore */
        }
      }
    })()

    return () => {
      cancelled = true
      canvasEsRef.current?.close()
      canvasEsRef.current = null
    }
  }, [
    opts.conversationId,
    opts.chainId,
    getAccessToken,
    applyPatchLocal,
    refreshLiveStatus,
  ])

  // Market / agent SSE only while a live session exists
  useEffect(() => {
    if (!liveActive) {
      marketEsRef.current?.close()
      marketEsRef.current = null
      return
    }

    let cancelled = false

    void (async () => {
      const token = await getAccessToken()
      if (!token || cancelled) return

      const url = `/api/missions/live?chainId=${opts.chainId || 1}&access_token=${encodeURIComponent(token)}`
      const es = new EventSource(url)
      marketEsRef.current = es

      es.onerror = () => {
        void refreshLiveStatus()
      }

      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            type: string
            step?: string
            message?: string
            at?: string
            missionId?: string
            op?: CanvasPatchOp["op"]
            widgetId?: string
            path?: string
            kind?: WidgetKind
            openuiDocument?: string | null
            data?: unknown
            payload?: Record<string, unknown>
          }

          if (msg.type === "agent") {
            const step = {
              step: msg.step || "status",
              message: msg.message || "",
              at: msg.at || new Date().toISOString(),
              missionId: msg.missionId,
            }
            setAgentEvents((prev) => [step, ...prev].slice(0, 40))
            if (msg.missionId) setActiveMissionId(msg.missionId)
            if (
              msg.step === "signing" ||
              msg.step === "quoting" ||
              msg.step === "submitted" ||
              msg.step === "deciding" ||
              msg.message?.includes("running") ||
              msg.message?.includes("Live")
            ) {
              setWorking(true)
            }
            if (
              msg.step === "status" &&
              (msg.message?.includes("paused") ||
                msg.message?.includes("stopped"))
            ) {
              setWorking(false)
              if (msg.message?.includes("stopped")) {
                void refreshLiveStatus()
              }
            }
            if (msg.step === "submitted" && msg.payload?.txHash) {
              const payload = msg.payload
              setTapeRows((prev) =>
                [
                  {
                    id: String(payload.txId || msg.at),
                    side: "swap",
                    status: "submitted",
                    txHash: String(payload.txHash),
                    chainId: Number(payload.chainId || opts.chainId || 1),
                    at: msg.at,
                  },
                  ...prev,
                ].slice(0, 40)
              )
            }
          }

          // canvas_patch handled by always-on /api/canvas/live

          if (msg.type === "market") {
            setLastTick(msg as unknown as Record<string, unknown>)
            applyPatchLocal({
              op: "set",
              widgetId: "pool_table",
              kind: "pool_table",
              path: "lastTick",
              data: msg,
            })
          }
        } catch {
          /* ignore */
        }
      }
    })()

    return () => {
      cancelled = true
      marketEsRef.current?.close()
      marketEsRef.current = null
    }
  }, [
    liveActive,
    opts.chainId,
    opts.conversationId,
    getAccessToken,
    applyPatchLocal,
    refreshLiveStatus,
  ])

  // Clear live market UI when session ends — keep canvas slots/shell
  useEffect(() => {
    if (liveActive) return
    setWorking(false)
    setAgentEvents([])
    setTapeRows([])
    setLastTick(null)
  }, [liveActive])

  // After each chat turn, re-check live status (tool may have started watch mid-turn)
  useEffect(() => {
    if (opts.refreshKey == null) return
    void refreshLiveStatus()
    void refreshCanvas()
  }, [opts.refreshKey, refreshLiveStatus, refreshCanvas])

  const syncCanvasShell = useCallback(
    async (openuiDocument: string) => {
      const token = await getAccessToken()
      if (!token || !openuiDocument.trim()) return
      try {
        const res = await fetch("/api/canvas", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversationId: opts.conversationId,
            patch: { op: "full", openuiDocument },
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.canvas) setCanvasModel(toClientModel(data.canvas))
        }
      } catch {
        /* ignore */
      }
    },
    [getAccessToken, opts.conversationId]
  )

  const missionAction = useCallback(
    async (action: string, missionId?: string | null) => {
      const token = await getAccessToken()
      if (!token) return
      const id = missionId || activeMissionId
      if (!id && action !== "kill_switch") return
      await fetch("/api/missions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, missionId: id }),
      })
      if (action === "pause" || action === "stop") setWorking(false)
      if (action === "resume" || action === "start") setWorking(true)
      await refreshLiveStatus()
    },
    [getAccessToken, activeMissionId, refreshLiveStatus]
  )

  return {
    liveActive,
    agentEvents,
    working,
    activeMissionId,
    tapeRows,
    lastTick,
    canvasModel,
    setCanvasModel,
    missionAction,
    refreshLiveStatus,
    refreshCanvas,
    syncCanvasShell,
  }
}
