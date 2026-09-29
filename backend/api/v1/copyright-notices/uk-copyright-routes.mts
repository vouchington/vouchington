import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  acknowledgeUkCopyrightNotice,
  currentUserCanReviewCopyrightNotices,
  receiveUkCopyrightNotice,
  recordUkCopyrightAcknowledgmentFailure,
  recordUkCopyrightRedressDecision,
  recordUkCopyrightReview,
  submitUkCopyrightRedress,
} from '@services/copyright-notices'
import {
  parseTerritorialNoticeBody,
  parseTerritorialRedressDecision,
  parseTerritorialText,
} from '@services/copyright-notices/territorial-http-input'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  parseJsonBody,
  requireAuth,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'

app.route('/api/v1/copyright-uk-notices').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-uk-notices')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-uk-notices.create' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const receipt = await receiveUkCopyrightNotice(
    currentUser,
    idempotencyKey,
    parseTerritorialNoticeBody(body),
  )
  const acknowledgment = await acknowledgeUkCopyrightNotice(currentUser, receipt.notice_id)
  ctx.setStatus(receipt.is_duplicate ? 200 : 201)
  ctx.json({ copyright_uk_notice: receipt, acknowledgment })
})

app.route('/api/v1/copyright-uk-notices/:id/acknowledgment-failures').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-uk-notices/:id/acknowledgment-failures',
  )
  assertNotSuspended(currentUser)
  const acknowledgment = await recordUkCopyrightAcknowledgmentFailure(
    currentUser,
    validateUUIDParam(ctx, 'id'),
  )
  ctx.json({ acknowledgment })
})

app.route('/api/v1/copyright-uk-notices/:id/reviews').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-uk-notices/:id/reviews',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const review = await recordUkCopyrightReview(
    currentUser,
    validateUUIDParam(ctx, 'id'),
    parseTerritorialText(body, 'rationale'),
  )
  ctx.setStatus(201)
  ctx.json({ copyright_uk_review: review })
})

app.route('/api/v1/copyright-uk-notices/:id/redress-requests').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/copyright-uk-notices/:id/redress-requests',
  )
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-uk-redress.create' })
  const redress = await submitUkCopyrightRedress(
    currentUser,
    validateUUIDParam(ctx, 'id'),
    requireIdempotencyKey(ctx),
    parseTerritorialText(body, 'explanation'),
  )
  ctx.setStatus(redress.is_duplicate ? 200 : 201)
  ctx.json({ copyright_uk_redress_request: redress })
})

app
  .route('/api/v1/copyright-uk-notices/:id/redress-requests/:redressId/decisions')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-uk-notices/:id/redress-requests/:redressId/decisions',
    )
    assertNotSuspended(currentUser)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const body = await parseJsonBody<Record<string, unknown>>(ctx)
    const decision = await recordUkCopyrightRedressDecision(
      currentUser,
      validateUUIDParam(ctx, 'id'),
      validateUUIDParam(ctx, 'redressId'),
      parseTerritorialRedressDecision(body),
    )
    ctx.setStatus(201)
    ctx.json({ copyright_uk_redress_decision: decision })
  })

function requireIdempotencyKey(ctx: Context): string {
  const value = ctx.req.headers['idempotency-key']
  ctx.assert(
    !Array.isArray(value) && typeof value === 'string' && isUUID(value),
    400,
    'Idempotency-Key must be a UUID',
  )
  return value
}
