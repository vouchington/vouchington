import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  acknowledgeUkCopyrightNotice,
  assertCopyrightIntakeEnabled,
  currentUserCanReviewCopyrightNotices,
  receiveUkCopyrightNotice,
  recordUkCopyrightAcknowledgmentFailure,
  recordUkCopyrightRedressDecision,
  recordUkCopyrightReview,
  submitUkCopyrightRedress,
} from '@services/copyright-notices'
import {
  parseTerritorialDecisionBody,
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
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import type {
  CopyrightTerritorialNoticeRequest,
  CopyrightTerritorialRedressDecisionRequest,
  CopyrightUkRedressRequest,
  CopyrightTerritorialReviewRequest,
} from './territorial-request-types.mts'

// Every handler keeps its admission order (kill switch, content type, authentication and role, rate
// limit, suspension, CAPTCHA, Idempotency-Key, field-named parsers, path id) and adds the generated
// contract immediately before the first service call. The service still decides ownership,
// jurisdiction availability, and existence, so those rejections stay behind a malformed body, as a
// missing field already did.
app.route('/api/v1/copyright-uk-notices').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  assertCopyrightIntakeEnabled()
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-uk-notices')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<CopyrightTerritorialNoticeRequest>(ctx)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-uk-notices.create' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const notice = parseTerritorialNoticeBody(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-uk-notices', { body })
  const receipt = await receiveUkCopyrightNotice(
    { user: currentUser, identity: `user:${currentUser.id}` },
    idempotencyKey,
    notice,
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
  const noticeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-uk-notices/:id/acknowledgment-failures', {
    path: ctx.params,
  })
  const acknowledgment = await recordUkCopyrightAcknowledgmentFailure(currentUser, noticeId)
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
  const body = await parseJsonBody<CopyrightTerritorialReviewRequest>(ctx)
  const noticeId = validateUUIDParam(ctx, 'id')
  const input = parseTerritorialDecisionBody(body, 'rationale')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-uk-notices/:id/reviews', {
    path: ctx.params,
    body,
  })
  const review = await recordUkCopyrightReview(currentUser, noticeId, input)
  ctx.setStatus(201)
  ctx.json({ copyright_uk_review: review })
})

// Staff record a UK complaint received through another channel. UK redress has no participant route.
app.route('/api/v1/copyright-uk-notices/:id/redress-requests').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-uk-notices/:id/redress-requests',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightUkRedressRequest>(ctx)
  const noticeId = validateUUIDParam(ctx, 'id')
  const idempotencyKey = requireIdempotencyKey(ctx)
  const explanation = parseTerritorialText(body, 'explanation')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-uk-notices/:id/redress-requests', {
    path: ctx.params,
    body,
  })
  const redress = await submitUkCopyrightRedress(currentUser, noticeId, idempotencyKey, explanation)
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
    const body = await parseJsonBody<CopyrightTerritorialRedressDecisionRequest>(ctx)
    const noticeId = validateUUIDParam(ctx, 'id')
    const redressId = validateUUIDParam(ctx, 'redressId')
    const input = parseTerritorialRedressDecision(body)
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-uk-notices/:id/redress-requests/:redressId/decisions',
      { path: ctx.params, body },
    )
    const decision = await recordUkCopyrightRedressDecision(currentUser, noticeId, redressId, input)
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
