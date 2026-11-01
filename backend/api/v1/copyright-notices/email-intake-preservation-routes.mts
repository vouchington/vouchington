import type { Context } from '@jongleberry/api-server'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import {
  currentUserCanReviewCopyrightNotices,
  placeCopyrightEmailReceiptPreservationHold,
  releaseCopyrightEmailReceiptPreservationHold,
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
import type {
  CopyrightEmailReceiptHoldRequest,
  CopyrightEmailReceiptHoldReleaseRequest,
} from './request-types.mts'

const holdRoute = 'POST:/api/v1/copyright-email-intakes/:id/preservation-holds'
const releaseRoute = 'POST:/api/v1/copyright-email-intakes/:id/preservation-holds/releases'

app.route('/api/v1/copyright-email-intakes/:id/preservation-holds').post(async (ctx: Context) => {
  apiRequestContract<typeof holdRoute, CopyrightEmailReceiptHoldRequest>(holdRoute)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    holdRoute,
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightEmailReceiptHoldRequest>(ctx)
  const receiptId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, holdRoute, { path: ctx.params, body })
  const hold = await placeCopyrightEmailReceiptPreservationHold(currentUser, receiptId, body.kind)
  ctx.setStatus(201)
  ctx.json({ hold })
})

app
  .route('/api/v1/copyright-email-intakes/:id/preservation-holds/releases')
  .post(async (ctx: Context) => {
    apiRequestContract<typeof releaseRoute, CopyrightEmailReceiptHoldReleaseRequest>(releaseRoute)
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      releaseRoute,
    )
    assertNotSuspended(currentUser)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const body = await parseJsonBody<CopyrightEmailReceiptHoldReleaseRequest>(ctx)
    const receiptId = validateUUIDParam(ctx, 'id')
    validateRequestContract(ctx, releaseRoute, { path: ctx.params, body })
    const hold = await releaseCopyrightEmailReceiptPreservationHold(
      currentUser,
      receiptId,
      body.hold_id,
    )
    ctx.setStatus(201)
    ctx.json({ hold })
  })
