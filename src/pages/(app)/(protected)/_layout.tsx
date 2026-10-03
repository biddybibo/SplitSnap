/**
 * Gated routes. Any file under src/pages/(app)/(protected)/ requires sign-in.
 * The `(protected)` folder is a Generouted route group — parentheses mean
 * it doesn't appear in the URL. For a dynamic page that does NOT require
 * sign-in, put it directly under src/pages/(app)/; for a static page, put it
 * at the top level of src/pages/.
 *
 * Children may call data hooks like `useUser()` safely because the parent
 * (app)/_layout.tsx mounts <RecordProvider> above this layout.
 *
 * The `fallback` keeps signed-out visitors inside the app's own chrome
 * (without it, AuthGate shows the SDK's full-screen, non-dismissible
 * overlay). The sign-in overlay opens on demand and can be dismissed.
 */

import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AuthGate, AuthOverlay } from 'deepspace'
import { Button } from '@/components/ui'
import { JoinPreview } from '@/components/bill/JoinPreview'
import { rememberReturnPath } from '@/lib/returnTo'

export default function ProtectedLayout() {
  return (
    <AuthGate fallback={<SignedOutPanel />}>
      <Outlet />
    </AuthGate>
  )
}

function SignedOutPanel() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { pathname } = useLocation()
  // A shared bill link gets the "you've been invited" preview instead of a generic sign-in wall.
  const billMatch = /^\/b\/([0-9a-f-]{36})$/.exec(pathname)
  if (billMatch) return <JoinPreview billId={billMatch[1]} path={pathname} />

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">Sign in to continue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is only available to signed-in users.
        </p>
        <Button
          className="mt-6 w-full"
          onClick={() => {
            // Sign-in returns to /home; remember a shared bill link so /home can send them back.
            rememberReturnPath(pathname)
            setShowAuthModal(true)
          }}
        >
          Sign in
        </Button>
        <Link
          to="/"
          className="mt-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to home
        </Link>
      </div>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
