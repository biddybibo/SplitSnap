import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { parseReceipt } from './parseReceipt'

export const actions: Record<string, ActionHandler<Env>> = {
  parseReceipt,
}
