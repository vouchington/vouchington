import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import {
  searchCrmContacts,
  createCrmContact,
  currentUserCanManageCrm,
  type CrmContactStatus,
  type CrmContactVertical,
  type CrmContactType,
  type CrmContactSource,
  type CreateCrmContactSocialAccountInput,
} from '@services/crm-contacts'
import { requireAuthAndRateLimit, parseJsonBody } from '../../../response-helpers.mts'

const VALID_STATUSES = new Set<CrmContactStatus>([
  'new',
  'awaiting_response',
  'in_conversation',
  'converted',
  'opted_out',
  'archived',
])

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

const parser = createPaginationParser({
  cursor: { type: 'name' },
  limit: { default: 25, max: 100 },
})

/**
 * GET /api/v1/crm/contacts — Search and list CRM contacts.
 * Query params: q, status, vertical, linked, limit, after
 */
app.route('/api/v1/crm/contacts').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanManageCrm, 'GET:/api/v1/crm/contacts')

  const { limit, after } = parser.parse(ctx.query)

  const q = typeof ctx.query.q === 'string' ? ctx.query.q.trim() : undefined
  const statusRaw = typeof ctx.query.status === 'string' ? ctx.query.status : undefined
  const verticalRaw = typeof ctx.query.vertical === 'string' ? ctx.query.vertical : undefined
  const linkedRaw = typeof ctx.query.linked === 'string' ? ctx.query.linked : undefined

  const status =
    statusRaw && VALID_STATUSES.has(statusRaw as CrmContactStatus)
      ? (statusRaw as CrmContactStatus)
      : undefined
  const vertical =
    verticalRaw && VALID_VERTICALS.has(verticalRaw as CrmContactVertical)
      ? (verticalRaw as CrmContactVertical)
      : undefined
  const linked = linkedRaw === 'true' ? true : linkedRaw === 'false' ? false : undefined

  const { results, page_info } = await searchCrmContacts({
    q: q || undefined,
    status,
    vertical,
    linked,
    limit,
    after,
  })

  ctx.json({ results, page_info })
})

type CreateContactBody = {
  name?: unknown
  email?: unknown
  phone?: unknown
  vertical?: unknown
  contact_type?: unknown
  source?: unknown
  follower_count?: unknown
  notes?: unknown
  metadata?: unknown
  assigned_to_id?: unknown
  social_accounts?: unknown
}

/**
 * POST /api/v1/crm/contacts — Create a new CRM contact.
 */
app.route('/api/v1/crm/contacts').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'POST:/api/v1/crm/contacts',
  )

  const body = await parseJsonBody<CreateContactBody>(ctx)

  ctx.assert(typeof body.name === 'string' && body.name.trim(), 422, 'name is required')
  ctx.assert(typeof body.email === 'string' && body.email.trim(), 422, 'email is required')

  const socialAccounts = Array.isArray(body.social_accounts)
    ? (body.social_accounts as CreateCrmContactSocialAccountInput[])
    : undefined

  const contact = await createCrmContact(currentUser, {
    name: body.name as string,
    email: body.email as string,
    phone: typeof body.phone === 'string' ? body.phone : null,
    vertical: VALID_VERTICALS.has(body.vertical as CrmContactVertical)
      ? (body.vertical as CrmContactVertical)
      : null,
    contact_type: (body.contact_type === 'influencer' ||
    body.contact_type === 'customer' ||
    body.contact_type === 'partner'
      ? body.contact_type
      : undefined) as CrmContactType | undefined,
    source: (body.source === 'manual' ||
    body.source === 'csv_import' ||
    body.source === 'inbound_email' ||
    body.source === 'referral'
      ? body.source
      : undefined) as CrmContactSource | undefined,
    follower_count: typeof body.follower_count === 'number' ? body.follower_count : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    metadata:
      body.metadata != null && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null,
    assigned_to_id: typeof body.assigned_to_id === 'string' ? body.assigned_to_id : null,
    social_accounts: socialAccounts,
  })

  ctx.setStatus(201)
  ctx.json({ contact })
})
