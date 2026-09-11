"use client"

import { useEffect, useRef, useState } from "react"

export function NeonShimmerBorder() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [])

  const { width: w, height: h } = dimensions

  // Fixed pixel values matching the cutouts exactly
  const inset = 12 // inset-3 = 12px
  const cornerRadius = 16 // rounded-2xl = 16px
  const cutoutRadius = 28 // rounded-br-[28px] / rounded-bl-[28px]
  
  // Logo cutout dimensions (p-3 pr-4 pb-4 around 56x56 image)
  const logoWidth = 12 + 56 + 16 // p-3 + image + pr-4 = 84
  const logoHeight = 12 + 56 + 16 // p-3 + image + pb-4 = 84
  
  // Button cutout dimensions (p-3 pl-4 pb-4 around button ~96x32)
  const buttonWidth = 12 + 16 + 96 // p-3 + pl-4 + button = ~124
  const buttonHeight = 12 + 32 + 16 // p-3 + button + pb-4 = ~60

  // Generate path that follows the exact visible boundary of the video section
  const generatePath = () => {
    if (w === 0 || h === 0) return ""

    const r = cornerRadius // 16px for main corners (rounded-2xl)
    const cr = cutoutRadius // 28px for cutout curves (rounded-br-[28px])

    // Main video container bounds (inset-3 = 12px from parent edge)
    const left = inset
    const right = w - inset
    const top = inset
    const bottom = h - inset

    // Logo cutout: positioned at parent's 0,0, size 84x84, curve at bottom-right
    const logoRight = logoWidth // 84px from left edge of parent
    const logoBottom = logoHeight // 84px from top edge of parent

    // Button cutout: positioned at parent's top-right, curve at bottom-left  
    const buttonLeft = w - buttonWidth // starts at w - 124
    const buttonBottom = buttonHeight // 60px from top edge of parent

    // Path traces the VISIBLE video edge:
    // - Top edge is hidden by cutouts, visible part is between them at y=inset(12)
    // - Cutouts sit on TOP of video, their inner curved corners touch video edge
    // 
    // The video edge at top is at y=12, but cutouts cover:
    // - Left side: from x=0 to x=84, from y=0 to y=84
    // - Right side: from x=(w-124) to x=w, from y=0 to y=60
    //
    // So visible video top edge runs from x=84 to x=(w-124) at y=12
    // BUT the cutout corners curve INTO the video area with 28px radius

    // The video container has rounded-2xl (16px corners) at inset-3 (12px from edge)
    // The cutouts sit at the parent's corners and have rounded-br/bl-[28px] inner curves
    // 
    // Key insight: The left edge of video starts at x=12, but the logo cutout covers
    // from x=0 to x=84 and y=0 to y=84. So the video's top-left corner is HIDDEN.
    // The visible boundary on the left starts at y=84 (logoBottom) and goes down.
    
    return `
      M ${logoRight} ${top}
      L ${buttonLeft} ${top}
      L ${buttonLeft} ${buttonBottom - cr}
      Q ${buttonLeft} ${buttonBottom}, ${buttonLeft + cr} ${buttonBottom}
      L ${right - r} ${buttonBottom}
      Q ${right} ${buttonBottom}, ${right} ${buttonBottom + r}
      L ${right} ${bottom - r}
      Q ${right} ${bottom}, ${right - r} ${bottom}
      L ${left + r} ${bottom}
      Q ${left} ${bottom}, ${left} ${bottom - r}
      L ${left} ${logoBottom}
      L ${logoRight - cr} ${logoBottom}
      Q ${logoRight} ${logoBottom}, ${logoRight} ${logoBottom - cr}
      L ${logoRight} ${top}
    `
  }

  // Calculate path length for animation
  const pathLength = w && h 
    ? 2 * (w - 2 * inset) + 2 * (h - 2 * inset) + logoWidth + logoHeight + buttonWidth + buttonHeight
    : 3000

  const rayLength = pathLength * 0.35

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <filter id="neonGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2" result="blur1" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Gradient for smooth faded edges on ray */}
          <linearGradient id="rayFade" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />
            <stop offset="15%" stopColor="rgba(255, 255, 255, 0.12)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.18)" />
            <stop offset="85%" stopColor="rgba(255, 255, 255, 0.12)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </linearGradient>
        </defs>
        {/* Base subtle border */}
        <path
          d={generatePath()}
          fill="none"
          stroke="rgba(255, 255, 255, 0.03)"
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Animated shine traveling around - smooth faded edges */}
        <path
          d={generatePath()}
          fill="none"
          stroke="url(#rayFade)"
          strokeWidth="1.5"
          filter="url(#neonGlow)"
          strokeLinecap="round"
          strokeDasharray={`${rayLength} ${pathLength - rayLength}`}
          style={{
            animation: "shine-around 4s linear infinite",
          }}
        />
      </svg>
    </div>
  )
}
