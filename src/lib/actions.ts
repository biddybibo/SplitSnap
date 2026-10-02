import { getAuthToken } from 'deepspace'

/**
 * Calls a server action and unwraps its ActionResult. Throws on failure so
 * callers can hand it straight to useAsyncResource.
 */
export async function callAction<T>(
  name: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAuthToken()}`,
    },
    body: JSON.stringify(params),
    signal,
  })
  if (res.status === 401) throw new Error('Your session expired. Sign in again.')
  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: string }
    | null
  if (!body) throw new Error(`Something went wrong (HTTP ${res.status})`)
  if (!body.success) throw new Error(body.error)
  return body.data
}
