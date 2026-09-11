"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
  Captcha,
  useCreateWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
  type PrivyEvents,
} from "@privy-io/react-auth"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import {
  formatPrivyOAuthError,
  isPrivyOAuthReturn,
} from "@/lib/privy-oauth"
import { findPrivyEvmWallet } from "@/lib/privy-wallet"

type AuthMode = "signin" | "signup"
type EmailStep = "idle" | "code_sent"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export default function AuthPage() {
  const router = useRouter()
  const { ready, authenticated, user } = usePrivy()
  const { createWallet } = useCreateWallet()
  const [mode, setMode] = useState<AuthMode>("signin")
  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [emailStep, setEmailStep] = useState<EmailStep>("idle")
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [oauthReturn, setOauthReturn] = useState(false)
  const handledAuthRef = useRef(false)
  const userInitiatedLoginRef = useRef(false)

  const ensureEvmWalletAndEnter = useCallback(async () => {
    if (preparing) return
    setPreparing(true)
    setError(null)
    try {
      // createOnLogin usually handles this; ensure EVM wallet exists as a fallback
      if (!findPrivyEvmWallet(user)) {
        try {
          await createWallet()
        } catch {
          // Wallet may already be creating / already exists
        }
      }
      router.replace("/chat")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish sign-in")
    } finally {
      setPreparing(false)
    }
  }, [createWallet, preparing, router, user])

  const loginCallbacks = useMemo<PrivyEvents["login"]>(
    () => ({
      onComplete: () => {
        handledAuthRef.current = true
        void ensureEvmWalletAndEnter()
      },
      onError: (privyError) => {
        setError(formatPrivyOAuthError(new Error(String(privyError)), "google"))
      },
    }),
    [ensureEvmWalletAndEnter]
  )

  const {
    initOAuth,
    loading: oauthLoading,
    state: oauthState,
  } = useLoginWithOAuth(loginCallbacks)
  const { sendCode, loginWithCode, state: otpState } = useLoginWithEmail(loginCallbacks)

  useEffect(() => {
    setOauthReturn(isPrivyOAuthReturn())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      handledAuthRef.current = false
      userInitiatedLoginRef.current = false
      return
    }
    if (handledAuthRef.current) return

    const oauthBack = isPrivyOAuthReturn()
    if (userInitiatedLoginRef.current && !oauthBack) return

    handledAuthRef.current = true
    void ensureEvmWalletAndEnter()
  }, [ready, authenticated, ensureEvmWalletAndEnter])

  const resetEmailFlow = () => {
    setEmailStep("idle")
    setOtpCode("")
    setError(null)
  }

  const startGoogle = async () => {
    if (!ready) {
      setError("Auth is still loading. Please wait a moment.")
      return
    }
    setError(null)
    resetEmailFlow()
    handledAuthRef.current = false
    userInitiatedLoginRef.current = true
    try {
      await initOAuth({ provider: "google" })
    } catch (err) {
      setError(formatPrivyOAuthError(err, "google"))
    }
  }

  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await sendCode({ email: email.trim() })
      setEmailStep("code_sent")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code")
    }
  }

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    userInitiatedLoginRef.current = true
    try {
      await loginWithCode({ code: otpCode.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code")
    }
  }

  const emailVerifying =
    otpState.status === "sending-code" || otpState.status === "submitting-code"
  const oauthCompleting =
    mounted && (oauthReturn || (oauthState.status === "loading" && !error))
  const busy = oauthLoading || preparing || emailVerifying || oauthCompleting
  const authLoading = !mounted || !ready

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-foreground/[0.03] blur-3xl" />
        <div className="absolute -right-24 bottom-1/4 h-72 w-72 rounded-full bg-foreground/[0.04] blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="mb-6 block">
            <Image
              src="/images/flowforge.png"
              alt="FlowForge"
              width={56}
              height={56}
              className="rounded-xl"
            />
          </Link>
          <h1 className="font-serif text-3xl font-normal text-foreground/90">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Google or email — Privy creates your EVM wallet automatically.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-6 sm:p-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signin")
                resetEmailFlow()
              }}
              className={`rounded-full py-2 text-sm transition-colors ${
                mode === "signin"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup")
                resetEmailFlow()
              }}
              className={`rounded-full py-2 text-sm transition-colors ${
                mode === "signup"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign up
            </button>
          </div>

          {oauthCompleting || preparing ? (
            <p className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground/80">
              <Loader2 className="h-4 w-4 animate-spin" />
              {preparing ? "Setting up your EVM wallet…" : "Completing sign in…"}
            </p>
          ) : authLoading ? (
            <p className="mb-4 text-center text-sm text-muted-foreground">
              Loading sign-in…
            </p>
          ) : null}

          {error && (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Captcha />

          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void startGoogle()}
              disabled={busy || authLoading}
              className="w-full gap-3 rounded-full border-border bg-background hover:bg-muted"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon className="h-5 w-5" />
              )}
              Continue with Google
            </Button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-card px-3 text-muted-foreground">or email</span>
              </div>
            </div>

            {emailStep === "idle" ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={busy}
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy || email.trim().length === 0}
                  className="w-full rounded-full"
                >
                  {otpState.status === "sending-code" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === "signin" ? (
                    "Sign in with email"
                  ) : (
                    "Sign up with email"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <p className="text-center text-sm text-muted-foreground">
                  Enter the code sent to{" "}
                  <span className="text-foreground">{email}</span>
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={busy}
                  placeholder="123456"
                  maxLength={6}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-lg tracking-[0.3em] text-foreground placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy || otpCode.length < 6}
                  className="w-full rounded-full"
                >
                  {otpState.status === "submitting-code" || preparing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify code"
                  )}
                </Button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetEmailFlow}
                  className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  Use a different email
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  )
}
