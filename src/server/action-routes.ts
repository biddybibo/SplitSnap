/**
 * Authenticated server actions and the tools they use to reach app records
 * and integrations.
 *
 * Trust model — read before adding an action:
 *
 * This worker is the only authorization boundary. `resolveAuth` establishes
 * *who* is calling; everything after it runs with that identity and no further
 * checks. The tools handed to an action (`createActionTools`) reach the record
 * room with `X-App-Action: 'true'`, which turns **per-record RBAC off**: the
 * `userId` they carry is the identity they act *as*, not a permission the room
 * enforces. `tools.query`/`tools.update`/`tools.remove`/`tools.deleteWhere`
 * will therefore read and write any collection, including other users' rows.
 *
 * So an action that takes a record id from `params` and passes it to `tools.*`
 * has authorized nothing. Check ownership yourself — load the record and
 * compare it against `userId` before writing (`chat-history.ts`'s `getChat` is
 * the SDK's worked example) — or the action is an open door with a login page
 * in front of it.
 *
 * `tools.deleteWhere(collection, where, limit?)` is the batch delete behind
 * cascades: it removes at most `limit` matching records (default 100, max 500)
 * and answers `{ deleted }`, so a drain loop repeats the same call until
 * `deleted` is below the limit. `where` must be non-empty and every key must
 * name a real field, so it can never truncate a collection by accident — but
 * with RBAC off it does not care who owns the rows, so scope `where` to the
 * caller yourself.
 */

import type { Hono } from 'hono'
import type { VerifyResult } from 'deepspace/worker'
import { actions } from '../actions/index.js'
import { createActionTools } from './action-tools.js'
import type { AppContext, Env } from '../../worker.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

export function registerActionRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.post('/api/actions/:name', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    // `resolveAuth` may accept a cookie session, which carries no bearer token
    // — and `VerifyResult` exposes the claims, not the raw JWT. Actions need
    // the token itself (user-billed integrations forward it), so a call
    // without one is refused as an auth failure, next to the check above,
    // rather than crashing on a missing header further down.
    const authHeader = c.req.header('Authorization') ?? ''
    const callerJwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!callerJwt) return c.json({ error: 'Unauthorized' }, 401)
    // Who called: actions run RBAC-off and can bill the owner, and the
    // platform's request log carries no user — this line is the attribution.
    // The name is a decoded path segment, so it is quoted, never interpolated raw.
    console.info(`[action] ${JSON.stringify(c.req.param('name'))} caller=${auth.userId}`)
    const name = c.req.param('name')
    const action = actions[name]
    if (!action) return c.json({ error: 'Action not found' }, 404)
    const params = await c.req.json<Record<string, unknown>>()
    const tools = createActionTools(c.env, auth.userId, callerJwt)
    const result = await action({ userId: auth.userId, params, tools, env: c.env, callerJwt })
    return c.json(result as unknown as Record<string, unknown>)
  })
}
