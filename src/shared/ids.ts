/** Bill ids are random UUIDs (crypto.randomUUID). One pattern for the server checks and the client routes. */
export const BILL_ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const BILL_ID = new RegExp(`^${BILL_ID_PATTERN}$`)

export function isBillId(value: unknown): value is string {
  return typeof value === 'string' && BILL_ID.test(value)
}
