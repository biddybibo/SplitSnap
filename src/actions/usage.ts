/** Daily AI-scan cap, shared by parseReceipt (enforces) and scansLeft (reports). */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'

export const DAILY_PARSE_LIMIT = 10

export function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Parses the user has used today, or null if the count couldn't be read. */
export async function parsesUsedToday(tools: ActionTools, userId: string, day = utcDay()): Promise<number | null> {
  const usage = await tools.query<{ parses?: number }>('usage', { where: { userId, day }, limit: 1 })
  if (!usage.success) return null
  return usage.data.records[0]?.data.parses ?? 0
}

/** The caller's own remaining scans for today. Members can't read `usage`, so the start screen asks here. */
export const scansLeft: ActionHandler<Env> = async ({ userId, tools }) => {
  const used = await parsesUsedToday(tools, userId)
  if (used === null) return { success: false, error: 'Could not read your scans' }
  return { success: true, data: { remaining: Math.max(0, DAILY_PARSE_LIMIT - used), limit: DAILY_PARSE_LIMIT } }
}
