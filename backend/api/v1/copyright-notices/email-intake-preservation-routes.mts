import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanReviewCopyrightNotices,
  placeCopyrightEmailReceiptPreservationHold,
  releaseCopyrightEmailReceiptPreservationHold,
  type CopyrightReceiptPreservationKind,
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

type ReceiptPreservationHoldRequest = { kind: CopyrightReceiptPreservationKind }

app.route('/api/v1/copyright-email-intakes/:id/preservation-holds').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const actor = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-email-intakes/:id/preservation-holds',
  )
  assertNotSuspended(actor)
  const receiptId = validateUUIDParam(ctx, 'id')
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<ReceiptPreservationHoldRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/preservation-holds', {
    path: ctx.params,
    body,
  })
  const hold = await placeCopyrightEmailReceiptPreservationHold(actor, receiptId, body.kind)
  ctx.setStatus(201)
  ctx.json({ copyright_email_intake_preservation_hold: hold })
})

app
  .route('/api/v1/copyright-email-intakes/:id/preservation-holds/:holdToken/releases')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const actor = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-email-intakes/:id/preservation-holds/:holdToken/releases',
    )
    assertNotSuspended(actor)
    const receiptId = validateUUIDParam(ctx, 'id')
    const holdToken = validateUUIDParam(ctx, 'holdToken')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-email-intakes/:id/preservation-holds/:holdToken/releases',
      { path: ctx.params },
    )
    const released = await releaseCopyrightEmailReceiptPreservationHold(actor, receiptId, holdToken)
    ctx.setStatus(201)
    ctx.json({ copyright_email_intake_preservation_hold_release: released })
  })
