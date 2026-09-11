import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanManageSupport,
  searchSupportContacts,
  getSupportContactById,
  getSupportThreadsByContactId,
  updateSupportContact,
} from '@services/customer-support'
import { createPaginationParser, defineQueryContract, queryString } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { apiQuery, apiRequest } from '../../../response-contract.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})
const contactFilters = defineQueryContract({ q: queryString() })

type SupportContactPatchBody = { name: string; notes?: string } | { name?: string; notes: string }

// GET /api/v1/support/contacts
app.route('/api/v1/support/contacts').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanManageSupport, 'GET:/api/v1/support/contacts')

  apiQuery('GET:/api/v1/support/contacts', parser, contactFilters)
  const { limit, after } = parser.parse(ctx.query)
  const q = typeof ctx.query.q === 'string' ? ctx.query.q : undefined

  const { results, page_info } = await searchSupportContacts({ q, limit, after })
  ctx.json({ results, page_info })
})

// GET /api/v1/support/contacts/:contactId
app.route('/api/v1/support/contacts/:contactId').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'GET:/api/v1/support/contacts/:contactId',
  )

  const { contactId } = ctx.params
  ctx.assert(isUUID(contactId!), 400, 'Invalid contact ID')

  const contact = await getSupportContactById(contactId!)
  ctx.assert(contact, 404, 'Contact not found')

  apiQuery('GET:/api/v1/support/contacts/:contactId', parser)
  const { limit, after } = parser.parse(ctx.query)
  const { results: threads, page_info } = await getSupportThreadsByContactId(contactId!, {
    limit,
    after,
  })

  ctx.json({ contact, threads, thread_page_info: page_info })
})

// PATCH /api/v1/support/contacts/:contactId
app.route('/api/v1/support/contacts/:contactId').patch(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'PATCH:/api/v1/support/contacts/:contactId',
  )

  const { contactId } = ctx.params
  ctx.assert(isUUID(contactId!), 400, 'Invalid contact ID')

  const contact = await getSupportContactById(contactId!)
  ctx.assert(contact, 404, 'Contact not found')

  const parsedBody = await ctx.request.json('10kb')
  ctx.assert(
    parsedBody !== null && typeof parsedBody === 'object' && !Array.isArray(parsedBody),
    400,
    'Request body must be an object',
  )
  const rawBody = parsedBody as Record<string, unknown>
  ctx.assert(
    Object.keys(rawBody).every(key => key === 'name' || key === 'notes'),
    400,
    'Only name and notes may be updated',
  )
  ctx.assert(
    rawBody.name === undefined || typeof rawBody.name === 'string',
    400,
    'name must be a string',
  )
  ctx.assert(
    rawBody.notes === undefined || typeof rawBody.notes === 'string',
    400,
    'notes must be a string',
  )
  ctx.assert(
    rawBody.name !== undefined || rawBody.notes !== undefined,
    400,
    'name or notes is required',
  )

  const validatedBody: SupportContactPatchBody =
    typeof rawBody.name === 'string'
      ? {
          name: rawBody.name,
          ...(typeof rawBody.notes === 'string' ? { notes: rawBody.notes } : {}),
        }
      : { notes: rawBody.notes as string }
  const body = apiRequest('PATCH:/api/v1/support/contacts/:contactId', validatedBody)

  const updated = await updateSupportContact(contactId!, {
    name: body.name,
    notes: body.notes,
  })

  ctx.json({ contact: updated })
})
