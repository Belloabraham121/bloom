"use client"

/**
 * Decorative SVG that visualizes agent intent → live trading widgets.
 * Pure graphics — no raster images.
 */
export function AgentTerminalGraphic() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-card/40 p-4 sm:p-6">
      <svg
        viewBox="0 0 640 360"
        className="h-auto w-full text-foreground"
        role="img"
        aria-label="Agent intent rendered as interactive trading widgets"
      >
        <defs>
          <linearGradient id="panel-fade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.08" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Agent prompt panel */}
        <rect x="24" y="40" width="200" height="280" rx="14" fill="url(#panel-fade)" stroke="currentColor" strokeOpacity="0.2" />
        <text x="44" y="72" fill="currentColor" opacity="0.45" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          AGENT INTENT
        </text>
        <rect x="44" y="92" width="160" height="28" rx="6" fill="currentColor" opacity="0.08" />
        <text x="56" y="110" fill="currentColor" opacity="0.7" style={{ fontSize: 12 }}>
          Analyze ETH/USDC…
        </text>
        <rect x="44" y="132" width="120" height="10" rx="3" fill="currentColor" opacity="0.12" />
        <rect x="44" y="152" width="148" height="10" rx="3" fill="currentColor" opacity="0.08" />
        <rect x="44" y="172" width="96" height="10" rx="3" fill="currentColor" opacity="0.08" />

        {/* Pulse dots */}
        <circle cx="56" cy="220" r="4" fill="currentColor" opacity="0.5">
          <animate attributeName="opacity" values="0.2;0.7;0.2" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="72" cy="220" r="4" fill="currentColor" opacity="0.35">
          <animate attributeName="opacity" values="0.15;0.55;0.15" dur="2s" begin="0.3s" repeatCount="indefinite" />
        </circle>
        <circle cx="88" cy="220" r="4" fill="currentColor" opacity="0.2">
          <animate attributeName="opacity" values="0.1;0.4;0.1" dur="2s" begin="0.6s" repeatCount="indefinite" />
        </circle>
        <text x="44" y="256" fill="currentColor" opacity="0.4" style={{ fontSize: 11 }}>
          Streaming via The Graph
        </text>

        {/* Flow arrows */}
        <path d="M240 180 H290" stroke="url(#spark)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d="M282 174 l10 6 -10 6" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />

        {/* Widget: price chart */}
        <rect x="304" y="40" width="300" height="140" rx="14" fill="url(#panel-fade)" stroke="currentColor" strokeOpacity="0.22" />
        <text x="324" y="68" fill="currentColor" opacity="0.45" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          LIVE POOL
        </text>
        <text x="324" y="96" fill="currentColor" opacity="0.9" style={{ fontSize: 22, fontWeight: 500 }}>
          ETH / USDC
        </text>
        <text x="480" y="96" fill="currentColor" opacity="0.55" style={{ fontSize: 14 }}>
          +2.4%
        </text>
        <path
          d="M324 150 C360 130, 380 160, 410 140 S460 110, 500 128 S560 150, 580 120"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="580" cy="120" r="3.5" fill="currentColor" opacity="0.7">
          <animate attributeName="r" values="3;5;3" dur="1.8s" repeatCount="indefinite" />
        </circle>

        {/* Widget: swap */}
        <rect x="304" y="200" width="140" height="120" rx="14" fill="url(#panel-fade)" stroke="currentColor" strokeOpacity="0.22" />
        <text x="324" y="228" fill="currentColor" opacity="0.45" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          SWAP
        </text>
        <rect x="324" y="244" width="100" height="22" rx="5" fill="currentColor" opacity="0.1" />
        <text x="334" y="259" fill="currentColor" opacity="0.65" style={{ fontSize: 11 }}>
          1.00 ETH
        </text>
        <rect x="324" y="276" width="100" height="22" rx="5" fill="currentColor" opacity="0.16" />
        <text x="334" y="291" fill="currentColor" opacity="0.8" style={{ fontSize: 11 }}>
          Execute
        </text>

        {/* Widget: route */}
        <rect x="464" y="200" width="140" height="120" rx="14" fill="url(#panel-fade)" stroke="currentColor" strokeOpacity="0.22" />
        <text x="484" y="228" fill="currentColor" opacity="0.45" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          ROUTE
        </text>
        <circle cx="500" cy="258" r="8" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.25" fill="none" />
        <circle cx="534" cy="258" r="8" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.25" fill="none" />
        <circle cx="568" cy="258" r="8" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.25" fill="none" />
        <path d="M508 258 H526 M542 258 H560" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.25" />
        <text x="484" y="296" fill="currentColor" opacity="0.55" style={{ fontSize: 11 }}>
          v2 → v3 → v4
        </text>
      </svg>
    </div>
  )
}
