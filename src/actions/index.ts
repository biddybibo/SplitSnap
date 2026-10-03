import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { addItem } from './addItem'
import { assignItem } from './assignItem'
import { joinBill } from './joinBill'
import { lockBill } from './lockBill'
import { parseReceipt } from './parseReceipt'
import { scansLeft } from './usage'

export const actions: Record<string, ActionHandler<Env>> = {
  addItem,
  assignItem,
  joinBill,
  lockBill,
  parseReceipt,
  scansLeft,
}
