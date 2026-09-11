"use client"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import { NeonShimmerBorder } from "@/components/neon-shimmer-border"
import { HowItWorksGraphic } from "@/components/how-it-works-graphic"
import { AgentTerminalGraphic } from "@/components/agent-terminal-graphic"
import {
  VisualIntelligenceIcon,
  RealTimeTelemetryIcon,
  OptimalExecutionIcon,
} from "@/components/value-prop-icons"

const VALUE_PROPS = [
  {
    title: "Visual Intelligence",
    description:
      "Replaces dry text and code blocks with dynamic, interactive components generated on the fly.",
    Icon: VisualIntelligenceIcon,
  },
  {
    title: "Real-Time Telemetry",
    description:
      "Streams live pool metrics, volume surges, and price ticks directly via The Graph.",
    Icon: RealTimeTelemetryIcon,
  },
  {
    title: "Optimal Execution",
    description:
      "Finds low-slippage execution paths across Uniswap v2, v3, and v4 pools automatically.",
    Icon: OptimalExecutionIcon,
  },
] as const

export default function LandingPage() {
  const scrollToContent = () => {
    document.getElementById("product")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative h-screen">
        {/* Video Container - full screen with padding */}
        <div className="absolute inset-3 overflow-hidden rounded-2xl">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source
              src="/images/39ac4a1d00fe62912ef5445b3325389a7cb588d5.mp4"
              type="video/mp4"
            />
          </video>
          <div className="absolute inset-0 bg-neutral-900/40" />
        </div>

        <NeonShimmerBorder />

        {/* Logo cutout */}
        <div className="absolute top-0 left-0 z-20">
          <div className="flex items-start">
            <div className="rounded-br-[28px] bg-background p-3 pr-4 pb-4">
              <Image
                src="/images/flowforge.png"
                alt="FlowForge"
                width={56}
                height={56}
                className="rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Launch App cutout */}
        <div className="absolute top-0 right-0 z-20">
          <div className="rounded-bl-[28px] bg-background p-3 pl-4 pb-4">
            <Button
              variant="outline"
              size="sm"
              className="shimmer-button rounded-md border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              asChild
            >
              <a href="/auth">Launch App</a>
            </Button>
          </div>
        </div>

        {/* Hero Content */}
        <div className="absolute bottom-10 left-6 z-10 max-w-lg sm:bottom-12 sm:left-12 md:max-w-xl">
          <h1 className="font-serif text-3xl font-normal leading-tight text-white/90 sm:text-4xl md:text-5xl">
            See What Your
            <br />
            Agent Sees
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
            Turn AI agent intent into live, interactive trading widgets. Real-time
            DEX telemetry, instant swaps, and visual intelligence—zero raw JSON.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="rounded-full border border-white bg-transparent px-5 py-2 text-sm text-white hover:bg-white hover:text-neutral-900"
            >
              <a href="/auth">Launch App</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/40 bg-transparent px-5 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              <a href="/auth">Try Live Demo</a>
            </Button>
          </div>
          <p className="mt-5 text-xs tracking-wide text-white/40 sm:text-sm">
            Powered by The Graph &amp; Uniswap Protocol
          </p>
        </div>

        {/* Scroll Indicator */}
        <button
          type="button"
          onClick={scrollToContent}
          className="absolute bottom-8 right-6 z-10 flex flex-col items-center gap-1.5 text-white/50 transition-colors hover:text-white sm:right-8"
          aria-label="Scroll to product"
        >
          <div className="flex h-8 w-5 items-start justify-center rounded-full border border-white/30 p-1">
            <div className="h-1.5 w-0.5 animate-bounce rounded-full bg-white" />
          </div>
        </button>
      </section>

      {/* Product / Value Proposition */}
      <section id="product" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-3xl font-normal text-foreground/90 sm:text-4xl">
            Visual intelligence for onchain agents
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            From agent intent to interactive trading surfaces—telemetry, routes, and
            execution without the raw JSON.
          </p>
        </div>

        <div className="mt-12 sm:mt-16">
          <AgentTerminalGraphic />
        </div>

        <div className="mt-12 grid gap-6 sm:mt-16 sm:grid-cols-3">
          {VALUE_PROPS.map(({ title, description, Icon }) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-card/40 p-6"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground/80">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-normal text-foreground/90">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-3xl font-normal text-foreground/90 sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Prompt your agent, synthesize live Uniswap data, and render widgets
              ready for one-click execution.
            </p>
          </div>

          <div className="mt-12 sm:mt-16">
            <HowItWorksGraphic />
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section id="cta" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card/40 px-6 py-14 text-center sm:px-12 sm:py-20">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              aria-hidden
            >
              <svg className="h-full w-full text-foreground" preserveAspectRatio="none">
                <defs>
                  <pattern
                    id="cta-grid"
                    width="32"
                    height="32"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M32 0H0V32"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.08"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#cta-grid)" />
              </svg>
            </div>

            <div className="relative">
              <h2 className="font-serif text-3xl font-normal text-foreground/90 sm:text-4xl md:text-5xl">
                The Visual Terminal for AI Agents
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                Experience real-time, agentic trading rendered directly on your screen.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" className="rounded-full px-6" asChild>
                  <a href="/auth">Launch App</a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full border-border bg-transparent px-6 text-muted-foreground hover:bg-muted hover:text-foreground"
                  asChild
                >
                  <a href="/auth">Try Live Demo</a>
                </Button>
              </div>
              <p className="mt-6 text-xs tracking-wide text-muted-foreground/70">
                Powered by The Graph &amp; Uniswap Protocol
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Powered by The Graph &amp; Uniswap Protocol
        </p>
      </footer>
    </main>
  )
}
