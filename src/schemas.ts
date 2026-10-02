/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { billsSchema, usageSchema } from './schemas/app-room-schemas'
import {
  receiptSchema,
  itemsSchema,
  claimsSchema,
  participantsSchema,
  guestsSchema,
  guestClaimsSchema,
  sharesSchema,
} from './schemas/bill-room-schemas'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  // App room
  billsSchema,
  usageSchema,
  // Bill rooms
  receiptSchema,
  itemsSchema,
  claimsSchema,
  participantsSchema,
  guestsSchema,
  guestClaimsSchema,
  sharesSchema,
]
