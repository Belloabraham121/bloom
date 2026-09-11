"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { Loader2, Check, Circle } from "lucide-react"

interface ProgressIndicatorProps {
  currentStep: string
  isComplete: boolean
  generateImages?: boolean
}

const ALL_STEPS = [
  { id: "ingest", label: "Ingesting content" },
  { id: "extract", label: "Extracting ideas" },
  { id: "generate", label: "Generating content" },
  { id: "images", label: "Creating images" },
  { id: "complete", label: "Complete" },
]

const STEP_DELAY = 250 // ms delay after each step completes

export function ProgressIndicator({ currentStep, isComplete, generateImages = true }: ProgressIndicatorProps) {
  const steps = useMemo(() => {
    if (generateImages) return ALL_STEPS
    return ALL_STEPS.filter((step) => step.id !== "images")
  }, [generateImages])

  const currentIndex = steps.findIndex((s) => s.id === currentStep)
  
  // Track visual step index with delay
  const [visualStepIndex, setVisualStepIndex] = useState(-1)
  const prevStepRef = useRef(currentStep)
  const hasInitializedRef = useRef(false)

  // Initialize visual state when component mounts with an active step
  useEffect(() => {
    if (currentStep && currentIndex >= 0 && !hasInitializedRef.current) {
      setVisualStepIndex(currentIndex)
      prevStepRef.current = currentStep
      hasInitializedRef.current = true
    }
  }, [currentStep, currentIndex])

  useEffect(() => {
    // Step changed - add delay before visual update
    if (prevStepRef.current !== currentStep && currentIndex > visualStepIndex && hasInitializedRef.current) {
      const timer = setTimeout(() => {
        setVisualStepIndex(currentIndex)
      }, STEP_DELAY)
      prevStepRef.current = currentStep
      return () => clearTimeout(timer)
    }
  }, [currentStep, currentIndex, visualStepIndex])

  // Reset visual state when complete or when starting over
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        setVisualStepIndex(steps.length - 1)
      }, STEP_DELAY)
      return () => clearTimeout(timer)
    }
  }, [isComplete, steps.length])

  // Reset when no current step (idle)
  useEffect(() => {
    if (!currentStep) {
      setVisualStepIndex(-1)
      prevStepRef.current = ""
      hasInitializedRef.current = false
    }
  }, [currentStep])

  return (
    <div className="space-y-1">
      {steps.map((step, index) => {
        const isActive = index === visualStepIndex && !isComplete
        const isDone = isComplete || index < visualStepIndex

        return (
          <div
            key={step.id}
            className={`flex items-center gap-3 rounded-md px-3 py-2 transition-all duration-200 ${
              isActive ? "bg-muted/50" : ""
            }`}
          >
            <div className="flex h-5 w-5 items-center justify-center">
              {isDone ? (
                <Check className="h-4 w-4 text-foreground animate-in fade-in zoom-in duration-200" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 animate-spin text-foreground" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/30" />
              )}
            </div>
            <span
              className={`text-sm transition-colors duration-200 ${
                isDone
                  ? "text-foreground"
                  : isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground/50"
              }`}
            >
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
