import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { addItem } from './addItem'
import { joinBill } from './joinBill'
import { lockBill } from './lockBill'
import { parseReceipt } from './parseReceipt'
import { scansLeft } from './usage'

export const actions: Record<string, ActionHandler<Env>> = {
  addItem,
  joinBill,
  lockBill,
  parseReceipt,
  scansLeft,
}
