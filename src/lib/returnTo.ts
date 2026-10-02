/**
 * Sign-in always lands on /home (src/server/http-routes.ts, oauth-complete), which
 * strands a friend who signed in from a shared bill link. Before sign-in we remember
 * the bill path; /home sends them back. Only `/b/<uuid>` paths are honored, so this
 * can never become an open redirect.
 */

const KEY = 'splitsnap:returnTo'
const MAX_AGE_MS = 10 * 60 * 1000
const BILL_PATH = /^\/b\/[0-9a-f-]{36}$/

export function rememberReturnPath(path: string): void {
  if (!BILL_PATH.test(path)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }))
  } catch {
    // Private mode / storage disabled: they'll land on /home, which still works.
  }
}

/** Returns the remembered bill path (once), or null. */
export function takeReturnPath(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    if (!raw) return null
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: unknown }
    if (typeof path !== 'string' || !BILL_PATH.test(path)) return null
    if (typeof at !== 'number' || Date.now() - at > MAX_AGE_MS) return null
    return path
  } catch {
    return null
  }
}
