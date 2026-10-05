/**
 * Card roulette: everyone who opted in puts their share in; one of them covers it all.
 * Pure helpers shared by the spin action (pick) and the settle screen (amountOwed).
 */

export type RouletteMode = 'even' | 'weighted'

export interface RouletteResult {
  loserId: string
  mode: RouletteMode
  entrantIds: string[]
}

/**
 * Picks the loser. `weights` (cents) apply in weighted mode — the more you ordered, the likelier you cover it.
 * `randomBelow(n)` must return a uniform integer in [0, n); the server passes a crypto-backed one.
 */
export function pickLoser(
  entrants: { id: string; weight: number }[],
  mode: RouletteMode,
  randomBelow: (n: number) => number,
): string {
  if (entrants.length < 2) throw new Error('Need at least two people in')
  const weights = entrants.map((e) => (mode === 'weighted' ? Math.max(1, Math.round(e.weight)) : 1))
  const total = weights.reduce((s, w) => s + w, 0)
  let r = randomBelow(total)
  for (let i = 0; i < entrants.length; i++) {
    if (r < weights[i]) return entrants[i].id
    r -= weights[i]
  }
  return entrants[entrants.length - 1].id
}

/** Uniform integer in [0, n) from crypto.getRandomValues, without modulo bias. */
export function cryptoRandomBelow(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error('n out of range')
  const limit = 2 ** 32 - (2 ** 32 % n)
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

/**
 * What a person owes the host once roulette has run. The host paid the restaurant, so:
 * - not in the game → their own share, as usual;
 * - the loser (not the host) → the shares of everyone who was in, the host's included;
 * - anyone else who was in → nothing.
 */
export function amountOwed(
  userId: string,
  hostId: string,
  shareOf: (id: string) => number,
  result: RouletteResult | null,
): number {
  if (userId === hostId) return 0
  if (!result || !result.entrantIds.includes(userId)) return shareOf(userId)
  if (result.loserId !== userId) return 0
  return result.entrantIds.reduce((s, id) => s + shareOf(id), 0)
}
