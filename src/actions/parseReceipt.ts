/**
 * parseReceipt — photo in, new bill out.
 *
 * Signed-in only (the action route refuses a call without a verified JWT).
 * Owner-billed: no authToken is passed to createDeepSpaceAI, so the cap below
 * is what protects the owner's credits.
 *
 * Writes the bill room (`receipt` + `items`) first and the app-room `bills`
 * index row last, so the index never points at an empty bill.
 */

import type { ActionHandler } from 'deepspace/worker'
import { createDeepSpaceAI } from 'deepspace/worker'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { ActionTools } from 'deepspace/worker'
import { createActionTools } from '../server/action-tools'
import { DAILY_PARSE_LIMIT, parsesUsedToday, utcDay } from './usage'
import type { Env } from '../../worker'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const receiptSchema = z.object({
  merchant: z.string(),
  receiptNumber: z.string().nullable().describe('Check / order / ticket number as printed, or null'),
  printedAt: z
    .string()
    .nullable()
    .describe('Date and time printed on the receipt as local YYYY-MM-DDTHH:MM (date only: YYYY-MM-DD), or null'),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number().int(),
      priceCents: z.number().int().describe('Line total in cents as printed (qty already applied); negative for discounts'),
    }),
  ),
  subtotalCents: z.number().int().nullable().describe('Printed subtotal, or null if the receipt prints none'),
  fees: z
    .array(z.object({ name: z.string(), cents: z.number().int() }))
    .describe('Charges added after the subtotal other than tax and tip: service charge, delivery, bag fee'),
  taxCents: z.number().int(),
  tipCents: z.number().int(),
  totalCents: z.number().int(),
})

type ParsedReceipt = z.infer<typeof receiptSchema>

const PROMPT =
  'Extract this restaurant receipt. All money is integer cents. ' +
  'One entry per printed line item; priceCents is the line total exactly as printed (qty already applied). ' +
  'Discounts are items with negative priceCents. Do not include subtotal, fees, tax, tip or total as items. ' +
  'Fees are charges added after the subtotal other than tax and tip (service charge, delivery fee, bag fee); ' +
  'list each in fees, even if it is printed among the items. Suggested gratuity amounts are not tips. ' +
  'subtotalCents is the printed subtotal, or null if none is printed. ' +
  'Use 0 for tax or tip if not printed. totalCents is the final total printed on the receipt. ' +
  'receiptNumber is the check, order or ticket number (not a table number, phone number or card digits). ' +
  'Never return card numbers or approval codes anywhere. ' +
  'Copy the numbers as printed even if they do not add up; never correct them.'

/**
 * Three-way check. Each comparison is reported separately so the review
 * screen can point at the lines or at the total/tax, not just "something's off".
 */
export function checkReceipt(
  r: Pick<ParsedReceipt, 'items' | 'subtotalCents' | 'fees' | 'taxCents' | 'tipCents' | 'totalCents'>,
) {
  const linesCents = r.items.reduce((sum, i) => sum + i.priceCents, 0)
  const feesCents = r.fees.reduce((sum, f) => sum + f.cents, 0)
  const subtotalForTotal = r.subtotalCents ?? linesCents
  return {
    linesCents,
    // null when the receipt prints no subtotal: nothing to compare the lines against.
    linesMatchSubtotal: r.subtotalCents === null ? null : linesCents === r.subtotalCents,
    subtotalPlusChargesMatchesTotal: subtotalForTotal + feesCents + r.taxCents + r.tipCents === r.totalCents,
    // What lockBill will require: lines + fees + tax + tip (+ adjustments) = printed total.
    offByCents: r.totalCents - (linesCents + feesCents + r.taxCents + r.tipCents),
  }
}

type PayHandles = {
  payVenmo?: string
  payCashApp?: string
  payPaypal?: string
}

/** The pay handles from the host's most recent bill, so they only type them once. Best effort. */
async function lastPayHandles(
  tools: ActionTools,
  env: Env,
  userId: string,
  callerJwt: string,
): Promise<PayHandles> {
  const last = await tools.query('bills', { where: { hostId: userId }, orderBy: 'createdAt', orderDir: 'desc', limit: 1 })
  const lastId = last.success ? last.data.records[0]?.recordId : undefined
  if (!lastId) return {}
  const prev = await createActionTools(env, userId, callerJwt, `bill:${lastId}`).get<PayHandles>('receipt', 'receipt')
  if (!prev.success) return {}
  const { payVenmo, payCashApp, payPaypal } = prev.data.record.data
  return { payVenmo: payVenmo ?? '', payCashApp: payCashApp ?? '', payPaypal: payPaypal ?? '' }
}

export const parseReceipt: ActionHandler<Env> = async ({ userId, params, tools, env, callerJwt }) => {
  const { imageBase64, mimeType, imageId } = params
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return { success: false, error: 'imageBase64 is required' }
  }
  if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { success: false, error: 'mimeType must be image/jpeg, image/png or image/webp' }
  }
  if (Math.floor((imageBase64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return { success: false, error: 'Image is larger than 5 MB' }
  }
  if (imageId !== undefined && (typeof imageId !== 'string' || imageId.length > 200)) {
    return { success: false, error: 'imageId must be a string' }
  }

  // Daily cap. Counted before the AI call so failed or abandoned parses still count.
  const day = utcDay()
  const used = await parsesUsedToday(tools, userId, day)
  if (used === null) return { success: false, error: 'Could not check your daily limit; try again' }
  if (used >= DAILY_PARSE_LIMIT) {
    return { success: false, error: `Daily limit reached (${DAILY_PARSE_LIMIT} receipts). Try again tomorrow.` }
  }
  const counted = await tools.create('usage', { userId, day, parses: used + 1 }, `${userId}:${day}`)
  if (!counted.success) return { success: false, error: 'Could not check your daily limit; try again' }

  let parsed: ParsedReceipt
  try {
    const ai = createDeepSpaceAI(env, 'anthropic')
    const { output } = await generateText({
      model: ai('claude-sonnet-5'),
      output: Output.object({ schema: receiptSchema }),
      maxOutputTokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: imageBase64, mediaType: mimeType },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })
    parsed = output
  } catch (err) {
    console.error('[parseReceipt] AI call failed', err instanceof Error ? err.message : err)
    return { success: false, error: "Couldn't read that receipt. Try a clearer, flatter photo." }
  }

  const payHandles = await lastPayHandles(tools, env, userId, callerJwt)
  const billId = crypto.randomUUID()
  const billTools = createActionTools(env, userId, callerJwt, `bill:${billId}`)

  const receipt = await billTools.create(
    'receipt',
    {
      merchant: parsed.merchant,
      printedSubtotalCents: parsed.subtotalCents,
      printedTotalCents: parsed.totalCents,
      printedTipCents: parsed.tipCents,
      receiptNumber: parsed.receiptNumber ?? '',
      printedAt: parsed.printedAt ?? '',
      imageId: imageId ?? '',
      ...payHandles,
    },
    'receipt',
  )
  if (!receipt.success) return { success: false, error: 'Could not save the bill; try again' }

  const lines = [
    ...parsed.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      priceCents: i.priceCents,
      kind: i.priceCents < 0 ? 'discount' : 'item',
    })),
    ...parsed.fees.map((f) => ({ name: f.name, qty: 1, priceCents: f.cents, kind: 'fee' })),
    { name: 'Tax', qty: 1, priceCents: parsed.taxCents, kind: 'tax' },
    ...(parsed.tipCents > 0 ? [{ name: 'Tip', qty: 1, priceCents: parsed.tipCents, kind: 'tip' }] : []),
  ]
  for (const line of lines) {
    const created = await billTools.create('items', line)
    if (!created.success) return { success: false, error: 'Could not save the bill; try again' }
  }

  // hostId is userBound: the room stamps the caller (the host) on these rows.
  const bill = await tools.create(
    'bills',
    {
      title: parsed.merchant,
      status: 'review',
      totalCents: parsed.totalCents,
      participantIds: [],
      receiptNumber: parsed.receiptNumber ?? '',
      printedAt: parsed.printedAt ?? '',
    },
    billId,
  )
  if (!bill.success) return { success: false, error: 'Could not save the bill; try again' }

  return { success: true, data: { billId, check: checkReceipt(parsed) } }
}
