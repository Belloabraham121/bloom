"use client"

import { Component, type ReactNode, type ErrorInfo } from "react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class OpenUIErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[OpenUI] Render error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: 16, color: "var(--muted-foreground)", fontSize: 13, textAlign: "center" }}>
          <p>Canvas failed to render</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 8, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
