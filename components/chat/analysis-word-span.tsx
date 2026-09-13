"use client"

interface AnalysisWordSpanProps {
  word: string
  delay?: number
}

export function AnalysisWordSpan({ word, delay = 0 }: AnalysisWordSpanProps) {
  return (
    <span
      className="inline text-foreground animate-word-reveal"
      style={{ animationDelay: `${delay}ms` }}
    >
      {word}
    </span>
  )
}
