"use client"

const STEPS = [
  {
    label: "Prompt",
    detail: "Tell your agent what pools to analyze or trade.",
    icon: (
      <g>
        <rect x="10" y="14" width="28" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 22h16M16 28h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="38" cy="12" r="3" fill="currentColor" opacity="0.5" />
      </g>
    ),
  },
  {
    label: "Synthesize",
    detail: "The agent pulls live liquidity data and optimal Uniswap quotes.",
    icon: (
      <g>
        <circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M24 14v4M24 30v4M14 24h4M30 24h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M18.5 18.5l2.5 2.5M27 27l2.5 2.5M29.5 18.5L27 21M21 27l-2.5 2.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle cx="24" cy="24" r="3" fill="currentColor" />
      </g>
    ),
  },
  {
    label: "Render",
    detail: "Interactive trading widgets render on your screen, ready for 1-click execution.",
    icon: (
      <g>
        <rect x="8" y="12" width="32" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 28l6-8 5 5 7-10 6 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="30" y="16" width="6" height="4" rx="1" fill="currentColor" opacity="0.45" />
      </g>
    ),
  },
] as const

export function HowItWorksGraphic() {
  return (
    <div className="w-full">
      {/* Desktop / tablet flow */}
      <div className="hidden sm:block">
        <svg
          viewBox="0 0 720 160"
          className="h-auto w-full text-foreground/80"
          role="img"
          aria-label="Prompt to Synthesize to Render flow"
        >
          <defs>
            <linearGradient id="flow-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="50%" stopColor="currentColor" stopOpacity="0.45" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Connecting line */}
          <path
            d="M120 48 H600"
            stroke="url(#flow-line)"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            fill="none"
          />

          {STEPS.map((step, i) => {
            const cx = 120 + i * 240
            return (
              <g key={step.label} transform={`translate(${cx - 24}, 24)`}>
                <circle
                  cx="24"
                  cy="24"
                  r="28"
                  fill="hsl(var(--card))"
                  stroke="hsl(var(--border))"
                  strokeWidth="1"
                />
                <g className="text-foreground">{step.icon}</g>
              </g>
            )
          })}

          {STEPS.map((step, i) => {
            const cx = 120 + i * 240
            return (
              <text
                key={`${step.label}-label`}
                x={cx}
                y={100}
                textAnchor="middle"
                className="fill-foreground"
                style={{ fontSize: 14, fontWeight: 500 }}
              >
                {step.label}
              </text>
            )
          })}

          {/* Arrow heads between steps */}
          {[0, 1].map((i) => {
            const x = 210 + i * 240
            return (
              <path
                key={`arrow-${i}`}
                d={`M${x} 44 l8 4 -8 4`}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}
        </svg>
      </div>

      {/* Step cards — all breakpoints */}
      <ol className="mt-2 grid gap-4 sm:mt-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            className="relative rounded-lg border border-border bg-card/60 p-5"
          >
            <div className="mb-3 flex items-center gap-3 sm:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground">
                <svg viewBox="0 0 48 48" className="h-7 w-7" aria-hidden>
                  {step.icon}
                </svg>
              </div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Step {i + 1}
              </span>
            </div>
            <span className="mb-2 hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block">
              Step {i + 1}
            </span>
            <h3 className="font-serif text-xl font-normal text-foreground/90">{step.label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
