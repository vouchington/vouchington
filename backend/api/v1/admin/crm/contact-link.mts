import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import {
  currentUserCanManageCrm,
  linkCrmContactToUser,
  unlinkCrmContactFromUser,
} from '@services/crm-contacts'
import {
  requireAuthAndRateLimit,
  validateUUIDParam,
  parseJsonBody,
} from '../../../response-helpers.mts'

/**
 * PUT /api/v1/crm/contacts/:contactId/user-link — Link a CRM contact to a user account.
 * Body: { user_id: string }
 */
app.route('/api/v1/crm/contacts/:contactId/user-link').put(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'PUT:/api/v1/crm/contacts/:contactId/user-link',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')
  const body = await parseJsonBody<{ user_id?: unknown }>(ctx)

  ctx.assert(
    typeof body.user_id === 'string' && isUUID(body.user_id),
    422,
    'user_id must be a valid UUID',
  )

  const contact = await linkCrmContactToUser(currentUser, contactId, body.user_id as string)

  ctx.json({ contact })
})

/**
 * DELETE /api/v1/crm/contacts/:contactId/user-link — Unlink a CRM contact from its user account.
 */
app.route('/api/v1/crm/contacts/:contactId/user-link').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageCrm,
    'DELETE:/api/v1/crm/contacts/:contactId/user-link',
  )

  const contactId = validateUUIDParam(ctx, 'contactId')

  const contact = await unlinkCrmContactFromUser(currentUser, contactId)

  ctx.json({ contact })
})
