import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  assertCopyrightIntakeEnabled,
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
  createCopyrightGuestIdentity,
} from '@services/copyright-notices'
import {
  parseCopyrightAppealForm,
  parseCopyrightCounterNoticeForm,
  parseCopyrightNoticeForm,
} from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import { enqueueCopyrightFormScreeningAndWait } from '@queues/ai-agents/enqueues/copyright-form-screening'
import { enqueueCopyrightAppealRecommendationAndWait } from '@queues/ai-agents/enqueues/copyright-appeal-recommendation'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import type {
  CopyrightAppealRequest,
  CopyrightCounterNoticeRequest,
  CopyrightNoticeFormRequest,
} from './request-types.mts'

// Each handler keeps its existing admission order (kill switch, content type, authentication,
// rate limit, CAPTCHA, field-named parsers, idempotency key). The generated contract then closes
// the body shape immediately before the first service call.
app.route('/api/v1/copyright-notices').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  assertCopyrightIntakeEnabled()
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'POST:/api/v1/copyright-notices')
  if (currentUser) assertNotSuspended(currentUser)
  const body = (await ctx.request.json('1mb')) as CopyrightNoticeFormRequest
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.create' })
  const input = parseCopyrightNoticeForm(body)
  const idempotencyKey = requireIdempotencyKey(ctx)
  const guestIp = ctx.ip
  ctx.assert(
    currentUser || (typeof guestIp === 'string' && guestIp.length > 0),
    400,
    'Client IP required',
  )
  validateRequestContract(ctx, 'POST:/api/v1/copyright-notices', { body })
  const { intake, isDuplicate } = await createCopyrightFormIntake({
    currentUser,
    requesterIdentity: currentUser
      ? `user:${currentUser.id}`
      : createCopyrightGuestIdentity(guestIp as string),
    idempotencyKey,
    request: { ...input, claimantTargets: input.targets },
  })
  await enqueueCopyrightFormScreeningAndWait(intake.copyright_notice_submission_id)
  ctx.setStatus(isDuplicate ? 200 : 202)
  ctx.json({ copyright_notice: { id: intake.copyright_notice_id }, is_duplicate: isDuplicate })
})

app.route('/api/v1/copyright-notices/:id/appeals').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-notices/:id/appeals')
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const body = (await ctx.request.json('1mb')) as CopyrightAppealRequest
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.appeal' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const input = parseCopyrightAppealForm(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-notices/:id/appeals', {
    path: ctx.params,
    body,
  })
  const result = await createCopyrightAppeal(currentUser, noticeId, idempotencyKey, input)
  if (!result.isDuplicate) await enqueueCopyrightAppealRecommendationAndWait(result.submission.id)
  ctx.setStatus(result.isDuplicate ? 200 : 201)
  ctx.json({ copyright_submission: { id: result.submission.id }, is_duplicate: result.isDuplicate })
})

app.route('/api/v1/copyright-notices/:id/counter-notices').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-notices/:id/counter-notices')
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const body = (await ctx.request.json('1mb')) as CopyrightCounterNoticeRequest
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.counter-notice' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const input = parseCopyrightCounterNoticeForm(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-notices/:id/counter-notices', {
    path: ctx.params,
    body,
  })
  const result = await createCopyrightCounterNotice(currentUser, noticeId, idempotencyKey, input)
  ctx.setStatus(result.isDuplicate ? 200 : 201)
  ctx.json({ copyright_submission: { id: result.submission.id }, is_duplicate: result.isDuplicate })
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
