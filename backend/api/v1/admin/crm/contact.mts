import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getCrmContact,
  getCrmContactSocialAccounts,
  updateCrmContact,
  archiveCrmContact,
  currentUserCanManageCrm,
  type CrmContactVertical,
  type CrmContactType,
} from '@services/crm-contacts'
import {
  requireAuthAndRateLimit,
  validateUUIDParam,
  parseJsonBody,
} from '../../../response-helpers.mts'

const VALID_VERTICALS = new Set<CrmContactVertical>([
  'credit_cards',
  'travel',
  'cars',
  'ai',
  'technology',
  'finance',
  'lifestyle',
  'other',
])

/**
 * GET /api/v1/crm/contacts/:contactId — Get a single CRM contact with social accounts.
 */
app.route('/api/v1/crm/contacts/:contactId').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanManageCrm, 'GET:/api/v1/crm/contacts/:contactId')

  const contactId = validateUUIDParam(ctx, 'contactId')

  const [contact, social_accounts] = await Promise.all([
    getCrmContact(contactId),
    getCrmContactSocialAccounts(contactId),
  ])
  ctx.assert(contact, 404, 'Contact not found')

  ctx.json({ contact, social_accounts })
})

type UpdateContactBody = {
  name?: unknown
  email?: unknown
  phone?: unknown
  vertical?: unknown
  contact_type?: unknown
  follower_count?: unknown
  notes?: unknown
  metadata?: unknown
  assigned_to_id?: unknown
  contacted_at?: unknown
  responded_at?: unknown
  converted_at?: unknown
  opted_out_at?: unknown
}

/**
 * PATCH /api/v1/crm/contacts/:contactId — Update a CRM contact's fields.
 */
app.route('/api/v1/crm/contacts/:contactId').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'PATCH:/api/v1/crm/contacts/:contactId',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')
  const body = await parseJsonBody<UpdateContactBody>(ctx)

  const updates: Parameters<typeof updateCrmContact>[2] = {}

  if ('name' in body) updates.name = typeof body.name === 'string' ? body.name : undefined
  if ('email' in body) updates.email = typeof body.email === 'string' ? body.email : undefined
  if ('phone' in body) updates.phone = typeof body.phone === 'string' ? body.phone : null
  if ('vertical' in body) {
    updates.vertical = VALID_VERTICALS.has(body.vertical as CrmContactVertical)
      ? (body.vertical as CrmContactVertical)
      : null
  }
  if ('contact_type' in body) {
    updates.contact_type = (
      body.contact_type === 'influencer' ||
      body.contact_type === 'customer' ||
      body.contact_type === 'partner'
        ? body.contact_type
        : undefined
    ) as CrmContactType | undefined
  }
  if ('follower_count' in body) {
    updates.follower_count = typeof body.follower_count === 'number' ? body.follower_count : null
  }
  if ('notes' in body) updates.notes = typeof body.notes === 'string' ? body.notes : null
  if ('metadata' in body) {
    updates.metadata =
      body.metadata != null && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null
  }
  if ('assigned_to_id' in body) {
    updates.assigned_to_id = typeof body.assigned_to_id === 'string' ? body.assigned_to_id : null
  }
  if ('contacted_at' in body) {
    if (body.contacted_at == null) {
      updates.contacted_at = null
    } else {
      ctx.assert(
        typeof body.contacted_at === 'string' && !Number.isNaN(Date.parse(body.contacted_at)),
        422,
        'Invalid contacted_at; expected ISO timestamp string',
      )
      updates.contacted_at = new Date(body.contacted_at)
    }
  }
  if ('responded_at' in body) {
    if (body.responded_at == null) {
      updates.responded_at = null
    } else {
      ctx.assert(
        typeof body.responded_at === 'string' && !Number.isNaN(Date.parse(body.responded_at)),
        422,
        'Invalid responded_at; expected ISO timestamp string',
      )
      updates.responded_at = new Date(body.responded_at)
    }
  }
  if ('converted_at' in body) {
    if (body.converted_at == null) {
      updates.converted_at = null
    } else {
      ctx.assert(
        typeof body.converted_at === 'string' && !Number.isNaN(Date.parse(body.converted_at)),
        422,
        'Invalid converted_at; expected ISO timestamp string',
      )
      updates.converted_at = new Date(body.converted_at)
    }
  }
  if ('opted_out_at' in body) {
    if (body.opted_out_at == null) {
      updates.opted_out_at = null
    } else {
      ctx.assert(
        typeof body.opted_out_at === 'string' && !Number.isNaN(Date.parse(body.opted_out_at)),
        422,
        'Invalid opted_out_at; expected ISO timestamp string',
      )
      updates.opted_out_at = new Date(body.opted_out_at)
    }
  }

  const contact = await updateCrmContact(currentUser, contactId, updates)

  ctx.json({ contact })
})

/**
 * DELETE /api/v1/crm/contacts/:contactId — Archive a CRM contact (soft delete).
 */
app.route('/api/v1/crm/contacts/:contactId').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'DELETE:/api/v1/crm/contacts/:contactId',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')

  await archiveCrmContact(currentUser, contactId)

  ctx.setStatus(204)
})
