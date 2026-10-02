/**
 * Bill room (`bill:<billId>`) collections.
 *
 * Every RecordRoom registers the full schema list, so these collections also
 * exist (empty) in the app room. The permissions below hold in any room.
 *
 * Roles: the app owner is pinned to `admin` in every room, so `admin` gets
 * exactly the member rules here. No one, owner included, edits another
 * person's claims or the host's receipt from a client. Anonymous callers
 * (`'*'`) see nothing.
 *
 * `userBound` stamps the writer's verified id on every write, server actions
 * included. Columns that must hold someone other than the writer (shares.userId,
 * guest rows) are therefore never userBound.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const NO_ACCESS: RolePermissions = { read: false, create: false, update: false, delete: false }
const READ_ONLY: RolePermissions = { read: true, create: false, update: false, delete: false }

/** One row per bill: the printed numbers the three-way check runs against. Created by parseReceipt. */
export const receiptSchema: CollectionSchema = {
  name: 'receipt',
  columns: [
    { name: 'merchant', storage: 'text', interpretation: 'plain' },
    { name: 'printedSubtotalCents', storage: 'number', interpretation: 'plain' },
    { name: 'printedTotalCents', storage: 'number', interpretation: 'plain' },
    // Optional "amount charged to card"; when set, tip = charged − printed total.
    { name: 'chargedCents', storage: 'number', interpretation: 'plain' },
    { name: 'imageId', storage: 'text', interpretation: 'plain' },
    { name: 'hostId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  ownerField: 'hostId',
  permissions: {
    '*': NO_ACCESS,
    viewer: READ_ONLY,
    member: {
      read: true,
      create: false,
      update: 'own',
      delete: false,
      writableFields: ['merchant', 'printedSubtotalCents', 'printedTotalCents', 'chargedCents'],
    },
    admin: {
      read: true,
      create: false,
      update: 'own',
      delete: false,
      writableFields: ['merchant', 'printedSubtotalCents', 'printedTotalCents', 'chargedCents'],
    },
  },
}

/**
 * Receipt lines. priceCents is the line total (qty already applied); discounts are negative.
 * Created only by server actions (parseReceipt; adding a line/tip/adjustment goes through a
 * host-only action) so a non-host can't inject lines the host then can't delete.
 */
export const itemsSchema: CollectionSchema = {
  name: 'items',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'qty', storage: 'number', interpretation: 'plain', default: 1 },
    { name: 'priceCents', storage: 'number', interpretation: 'plain', required: true },
    {
      name: 'kind',
      storage: 'text',
      interpretation: { kind: 'select', options: ['item', 'tax', 'tip', 'discount', 'adjustment'] },
      default: 'item',
    },
    { name: 'hostId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  ownerField: 'hostId',
  permissions: {
    '*': NO_ACCESS,
    viewer: READ_ONLY,
    member: {
      read: true,
      create: false,
      update: 'own',
      delete: 'own',
      writableFields: ['name', 'qty', 'priceCents', 'kind'],
    },
    admin: {
      read: true,
      create: false,
      update: 'own',
      delete: 'own',
      writableFields: ['name', 'qty', 'priceCents', 'kind'],
    },
  },
}

/** "I had this." One per person per item; userId is always the caller. */
export const claimsSchema: CollectionSchema = {
  name: 'claims',
  columns: [
    { name: 'itemId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  uniqueOn: ['itemId', 'userId'],
  ownerField: 'userId',
  permissions: {
    '*': NO_ACCESS,
    viewer: READ_ONLY,
    member: { read: true, create: true, update: 'own', delete: 'own', writableFields: ['itemId'] },
    admin: { read: true, create: true, update: 'own', delete: 'own', writableFields: ['itemId'] },
  },
}

/** Signed-in people at the table. Each person creates and edits only their own row. */
export const participantsSchema: CollectionSchema = {
  name: 'participants',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'displayName', storage: 'text', interpretation: 'plain' },
    { name: 'paid', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  uniqueOn: ['userId'],
  ownerField: 'userId',
  permissions: {
    '*': NO_ACCESS,
    viewer: READ_ONLY,
    member: { read: true, create: true, update: 'own', delete: false, writableFields: ['displayName', 'paid'] },
    admin: { read: true, create: true, update: 'own', delete: false, writableFields: ['displayName', 'paid'] },
  },
}

/** Host-added people who won't sign in (stretch). Written only by host-only actions. */
export const guestsSchema: CollectionSchema = {
  name: 'guests',
  columns: [
    { name: 'displayName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'paid', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  permissions: { '*': NO_ACCESS, viewer: READ_ONLY, member: READ_ONLY, admin: READ_ONLY },
}

/** Claims the host makes for a guest (stretch). Written only by claimForGuest. */
export const guestClaimsSchema: CollectionSchema = {
  name: 'guestClaims',
  columns: [
    { name: 'itemId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'guestId', storage: 'text', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['itemId', 'guestId'],
  permissions: { '*': NO_ACCESS, viewer: READ_ONLY, member: READ_ONLY, admin: READ_ONLY },
}

/**
 * Final amounts, snapshotted by lockBill. userId is a user id or `guest:<guestId>`;
 * not userBound, because lockBill writes rows for everyone.
 */
export const sharesSchema: CollectionSchema = {
  name: 'shares',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'subtotalCents', storage: 'number', interpretation: 'plain' },
    { name: 'taxCents', storage: 'number', interpretation: 'plain' },
    { name: 'tipCents', storage: 'number', interpretation: 'plain' },
    { name: 'adjustmentCents', storage: 'number', interpretation: 'plain' },
    { name: 'totalCents', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['userId'],
  permissions: { '*': NO_ACCESS, viewer: READ_ONLY, member: READ_ONLY, admin: READ_ONLY },
}
