import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { currentUserCanManageCrm } from '@services/crm-contacts'
import { getCrmNotesByContactId, createCrmNote, deleteCrmNote } from '@services/crm-notes'
import {
  requireAuthAndRateLimit,
  validateUUIDParam,
  parseJsonBody,
} from '../../../response-helpers.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

/**
 * GET /api/v1/crm/contacts/:contactId/notes — List notes for a contact.
 */
app.route('/api/v1/crm/contacts/:contactId/notes').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'GET:/api/v1/crm/contacts/:contactId/notes',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')

  const { limit, after } = parser.parse(ctx.query)

  const { results, page_info } = await getCrmNotesByContactId(contactId, { limit, after })

  ctx.json({ results, page_info })
})

/**
 * POST /api/v1/crm/contacts/:contactId/notes — Create a note for a contact.
 */
app.route('/api/v1/crm/contacts/:contactId/notes').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'POST:/api/v1/crm/contacts/:contactId/notes',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')
  const body = await parseJsonBody<{ body?: unknown }>(ctx)

  ctx.assert(typeof body.body === 'string' && body.body.trim(), 422, 'body is required')

  const note = await createCrmNote(currentUser, {
    contact_id: contactId,
    body: body.body as string,
  })

  ctx.setStatus(201)
  ctx.json({ note })
})

/**
 * DELETE /api/v1/crm/contacts/:contactId/notes/:noteId — Soft-delete a note.
 */
app.route('/api/v1/crm/contacts/:contactId/notes/:noteId').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'DELETE:/api/v1/crm/contacts/:contactId/notes/:noteId',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')
  const noteId = validateUUIDParam(ctx, 'noteId')

  await deleteCrmNote(currentUser, contactId, noteId)

  ctx.setStatus(204)
})
