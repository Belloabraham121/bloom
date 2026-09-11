"use client"

import { PrivyProvider } from "@privy-io/react-auth"
import { getAppOAuthRedirectUrl } from "@/lib/privy-oauth"

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  if (!appId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Missing <code className="text-foreground">NEXT_PUBLIC_PRIVY_APP_ID</code> in
          .env.local. Add your Privy credentials and restart the dev server.
        </p>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "email"],
        customOAuthRedirectUrl: getAppOAuthRedirectUrl(),
        embeddedWallets: {
          ethereum: {
            // Auto-create an EVM embedded wallet for users who don't have one yet
            createOnLogin: "users-without-wallets",
          },
        },
        appearance: {
          theme: "dark",
          showWalletLoginFirst: false,
          accentColor: "#a3a3a3",
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
