/**
 * SPIKE — throwaway. Proves image → Claude → structured JSON works through
 * createDeepSpaceAI. No usage cap, no records, no R2; the real parseReceipt
 * replaces this once schemas exist.
 *
 * Sign-in is enforced by the action route (401 without a verified JWT).
 * No authToken is passed to createDeepSpaceAI, so the app owner is billed.
 */

import type { ActionHandler } from 'deepspace/worker'
import { createDeepSpaceAI } from 'deepspace/worker'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { Env } from '../../worker'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const receiptSchema = z.object({
  merchant: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number().int(),
      priceCents: z.number().int().describe('Line total in cents for this row (qty already applied)'),
    }),
  ),
  taxCents: z.number().int(),
  tipCents: z.number().int(),
  totalCents: z.number().int(),
})

export const parseReceipt: ActionHandler<Env> = async ({ params, env }) => {
  const { imageBase64, mimeType } = params
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return { success: false, error: 'imageBase64 is required' }
  }
  if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { success: false, error: 'mimeType must be image/jpeg, image/png or image/webp' }
  }
  if (Math.floor((imageBase64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return { success: false, error: 'Image is larger than 5 MB' }
  }

  const ai = createDeepSpaceAI(env, 'anthropic')
  try {
    const { object } = await generateObject({
      model: ai('claude-sonnet-5'),
      schema: receiptSchema,
      maxOutputTokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: imageBase64, mediaType: mimeType },
            {
              type: 'text',
              text:
                'Extract this restaurant receipt. All money is integer cents. ' +
                'One entry per printed line item; priceCents is the line total as printed. ' +
                'Discounts are items with negative priceCents. Do not include subtotal, tax, ' +
                'tip or total as items. Use 0 for tax or tip if not printed. ' +
                'totalCents is the final total printed on the receipt.',
            },
          ],
        },
      ],
    })
    return { success: true, data: object }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Parse failed' }
  }
}
