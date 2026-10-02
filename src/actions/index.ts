import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { addItem } from './addItem'
import { parseReceipt } from './parseReceipt'
import { scansLeft } from './usage'

export const actions: Record<string, ActionHandler<Env>> = {
  addItem,
  parseReceipt,
  scansLeft,
}
