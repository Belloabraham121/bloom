export function VisualIntelligenceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden>
      <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 30l6-8 5 5 6-9 7 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="34" cy="16" r="2.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function RealTimeTelemetryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden>
      <path
        d="M8 32c4-10 8-14 12-14s6 10 10 10 6-12 10-16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="12" r="3" fill="currentColor" opacity="0.55" />
      <path d="M8 38h32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
      <path
        d="M14 38v-4M24 38v-8M34 38v-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  )
}

export function OptimalExecutionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden>
      <circle cx="16" cy="18" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="32" cy="18" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="32" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M21 22.5l3 4.5 3-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <path d="M16 18h16" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
    </svg>
  )
}
