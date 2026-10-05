import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { addItem } from './addItem'
import { assignItem } from './assignItem'
import { deleteBill } from './deleteBill'
import { addGuest, removeGuest, setGuestPaid } from './guests'
import { joinBill } from './joinBill'
import { lockBill } from './lockBill'
import { parseReceipt } from './parseReceipt'
import { remindUnpaid } from './remindUnpaid'
import { spinRoulette } from './spinRoulette'
import { scansLeft } from './usage'

export const actions: Record<string, ActionHandler<Env>> = {
  addGuest,
  addItem,
  assignItem,
  deleteBill,
  joinBill,
  lockBill,
  parseReceipt,
  remindUnpaid,
  removeGuest,
  scansLeft,
  setGuestPaid,
  spinRoulette,
}
