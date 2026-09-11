/** Privy OAuth callback — register this in Google Cloud Console. */
export const PRIVY_OAUTH_PROVIDER_CALLBACK =
  "https://auth.privy.io/api/v1/oauth/callback"

/** Where Privy redirects users after OAuth — add in Privy Dashboard → Allowed OAuth redirect URLs. */
export function getAppOAuthRedirectUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")
  return `${base}/auth`
}

export function isPrivyOAuthReturn(): boolean {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  return Boolean(
    params.get("privy_oauth_code") &&
      params.get("privy_oauth_state") &&
      params.get("privy_oauth_provider")
  )
}

export function formatPrivyOAuthError(
  err: unknown,
  provider: "google" | "github" = "google"
): string {
  const raw = err instanceof Error ? err.message : String(err)
  const label = provider === "google" ? "Google" : "GitHub"

  if (raw.includes("disallowed_login_method") || /not allowed/i.test(raw)) {
    return `${label} sign-in is not enabled for this Privy app. Enable it in the Privy Dashboard.`
  }
  if (raw.includes("CAPTCHA") || raw.includes("captcha")) {
    return "CAPTCHA verification failed. Refresh the page and try again."
  }
  if (raw.includes("redirect") || raw.includes("oauth_redirect")) {
    return `OAuth redirect URL is not allowed. Add ${getAppOAuthRedirectUrl()} under Privy Dashboard → Allowed OAuth redirect URLs.`
  }
  if (raw.includes("in-app browser")) {
    return "OAuth is blocked in embedded browsers. Open this page in Chrome, Safari, or Firefox."
  }
  if (err instanceof Error && err.message) return err.message
  return `${label} sign-in failed. Check Privy Dashboard OAuth settings and try again.`
}
