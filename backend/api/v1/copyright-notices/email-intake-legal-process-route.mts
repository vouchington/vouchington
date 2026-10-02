import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanReviewCopyrightNotices,
  recordCopyrightEmailIntakeLegalProcess,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import type { CopyrightEmailLegalProcessRequest } from './request-types.mts'

// Closes an initial email intake that is legal process with no reply and no email of any kind. The
// reason may name a legal matter: the route never echoes it, and the service never logs it. The
// generated contract validates the shape; the service owns the blank and length rules.
app.route('/api/v1/copyright-email-intakes/:id/legal-process').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-email-intakes/:id/legal-process',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightEmailLegalProcessRequest>(ctx)
  const intakeId = validateUUIDParam(ctx, 'id')
  ctx.assert(typeof body.reason === 'string', 422, 'reason is required')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/legal-process', {
    path: ctx.params,
    body,
  })
  await recordCopyrightEmailIntakeLegalProcess({ currentUser, intakeId, reason: body.reason })
  ctx.setStatus(201)
  ctx.json({ decision: 'legal_process' })
})
