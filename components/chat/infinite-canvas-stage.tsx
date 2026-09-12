"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5
const DEFAULT_CAMERA = { x: 0, y: 0, zoom: 1 }

type CameraState = { x: number; y: number; zoom: number }

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

function storageKey(conversationKey?: string) {
  return `bloom-canvas-camera:${conversationKey ?? "default"}`
}

function loadCamera(conversationKey?: string): CameraState {
  if (typeof window === "undefined") return DEFAULT_CAMERA
  try {
    const raw = localStorage.getItem(storageKey(conversationKey))
    if (!raw) return DEFAULT_CAMERA
    const parsed = JSON.parse(raw) as Partial<CameraState>
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.zoom === "number"
    ) {
      return {
        x: parsed.x,
        y: parsed.y,
        zoom: clampZoom(parsed.zoom),
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_CAMERA
}

function saveCamera(conversationKey: string | undefined, camera: CameraState) {
  try {
    localStorage.setItem(storageKey(conversationKey), JSON.stringify(camera))
  } catch {
    /* quota / private mode */
  }
}

export interface InfiniteCanvasStageProps {
  children: ReactNode
  conversationKey?: string
  className?: string
}

export function InfiniteCanvasStage({
  children,
  conversationKey,
  className,
}: InfiniteCanvasStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<CameraState>(() =>
    loadCamera(conversationKey)
  )
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    setCamera(loadCamera(conversationKey))
  }, [conversationKey])

  useEffect(() => {
    saveCamera(conversationKey, camera)
  }, [conversationKey, camera])

  const resetView = useCallback(() => {
    setCamera(DEFAULT_CAMERA)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = stage.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const { x, y, zoom } = cameraRef.current
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
      const nextZoom = clampZoom(zoom * factor)
      const worldX = (mouseX - x) / zoom
      const worldY = (mouseY - y) / zoom
      setCamera({
        x: mouseX - worldX * nextZoom,
        y: mouseY - worldY * nextZoom,
        zoom: nextZoom,
      })
    }

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-canvas-pan-surface]")) return
      if (target.closest("[data-canvas-no-pan]")) return
      if (e.button !== 0) return
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: cameraRef.current.x,
        originY: cameraRef.current.y,
      }
      stage.setPointerCapture(e.pointerId)
      stage.style.cursor = "grabbing"
    }

    const onPointerMove = (e: PointerEvent) => {
      const pan = panRef.current
      if (!pan || pan.pointerId !== e.pointerId) return
      setCamera((prev) => ({
        ...prev,
        x: pan.originX + (e.clientX - pan.startX),
        y: pan.originY + (e.clientY - pan.startY),
      }))
    }

    const endPan = (e: PointerEvent) => {
      const pan = panRef.current
      if (!pan || pan.pointerId !== e.pointerId) return
      panRef.current = null
      if (stage.hasPointerCapture(e.pointerId)) {
        stage.releasePointerCapture(e.pointerId)
      }
      stage.style.cursor = ""
    }

    stage.addEventListener("wheel", onWheel, { passive: false })
    stage.addEventListener("pointerdown", onPointerDown)
    stage.addEventListener("pointermove", onPointerMove)
    stage.addEventListener("pointerup", endPan)
    stage.addEventListener("pointercancel", endPan)

    return () => {
      stage.removeEventListener("wheel", onWheel)
      stage.removeEventListener("pointerdown", onPointerDown)
      stage.removeEventListener("pointermove", onPointerMove)
      stage.removeEventListener("pointerup", endPan)
      stage.removeEventListener("pointercancel", endPan)
    }
  }, [])

  return (
    <div
      ref={stageRef}
      className={cn("relative h-full w-full touch-none overflow-hidden", className)}
      data-canvas-pan-surface
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--muted)/0.12)_1px,transparent_1px)] [background-size:24px_24px]"
        aria-hidden
      />

      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
        }}
      >
        <div
          className="pointer-events-auto relative min-h-[480px] min-w-[640px] p-4 sm:p-6"
          data-canvas-no-pan
        >
          {children}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pointer-events-auto absolute bottom-4 left-4 z-10 h-8 gap-1.5 bg-background/90 text-xs shadow-sm backdrop-blur-sm"
        onClick={resetView}
        aria-label="Reset canvas view"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset view
      </Button>
    </div>
  )
}
