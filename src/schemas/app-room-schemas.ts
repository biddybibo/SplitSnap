/**
 * App room (`app:<APP_ID>`) collections: the bills index and AI usage caps.
 *
 * Every RecordRoom registers the full schema list, so these collections also
 * exist (empty) in each `bill:<id>` room. The permissions below hold in any
 * room: members can never write either collection.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const NO_ACCESS: RolePermissions = { read: false, create: false, update: false, delete: false }

/** Written only by server actions (parseReceipt creates, joinBill/lockBill update). */
export const billsSchema: CollectionSchema = {
  name: 'bills',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain' },
    // Stamped with the caller's id by the creating action, i.e. the host.
    { name: 'hostId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['review', 'locked'] }, default: 'review' },
    { name: 'totalCents', storage: 'number', interpretation: 'plain' },
    { name: 'participantIds', storage: 'text', interpretation: { kind: 'json' }, default: [] },
  ],
  ownerField: 'hostId',
  collaboratorsField: 'participantIds',
  permissions: {
    '*': NO_ACCESS,
    viewer: { read: 'shared', create: false, update: false, delete: false },
    member: { read: 'shared', create: false, update: false, delete: false },
    admin: { read: 'shared', create: false, update: false, delete: false },
  },
}

/** Per-user daily parse counter. Server actions only; no client role can see it. */
export const usageSchema: CollectionSchema = {
  name: 'usage',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'day', storage: 'text', interpretation: 'plain', required: true }, // YYYY-MM-DD, UTC
    { name: 'parses', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  uniqueOn: ['userId', 'day'],
  permissions: {
    '*': NO_ACCESS,
    viewer: NO_ACCESS,
    member: NO_ACCESS,
    admin: NO_ACCESS,
  },
}
