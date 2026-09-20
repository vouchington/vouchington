import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
  createCopyrightGuestIdentity,
  assertCopyrightIntakeEnabled,
} from '@services/copyright-notices'
import {
  boundedString,
  parseCopyrightNoticeForm,
  parseCopyrightTargetIds,
} from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import { enqueueCopyrightFormScreeningAndWait } from '@queues/ai-agents/enqueues/copyright-form-screening'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateUUIDParam,
} from '../../response-helpers.mts'
import './moderator-routes.mts'

app.route('/api/v1/copyright-notices').post(async (ctx: Context) => {
  assertCopyrightIntakeEnabled()
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'POST:/api/v1/copyright-notices')
  if (currentUser) assertNotSuspended(currentUser)
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.create' })
  const input = parseCopyrightNoticeForm(body)
  const idempotencyKey = requireIdempotencyKey(ctx)
  const guestIp = ctx.ip
  ctx.assert(
    currentUser || (typeof guestIp === 'string' && guestIp.length > 0),
    400,
    'Client IP required',
  )
  const { intake, isDuplicate } = await createCopyrightFormIntake({
    requesterUserId: currentUser?.id ?? null,
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
  assertCopyrightIntakeEnabled()
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-notices/:id/appeals')
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.appeal' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const targetIds = parseCopyrightTargetIds(body.target_ids)
  ctx.assert(boundedString(body.reason, 50_000), 422, 'reason is required')
  const result = await createCopyrightAppeal(currentUser, noticeId, idempotencyKey, {
    reason: body.reason,
    targetIds,
  })
  ctx.setStatus(result.isDuplicate ? 200 : 201)
  ctx.json({ copyright_submission: { id: result.submission.id }, is_duplicate: result.isDuplicate })
})

app.route('/api/v1/copyright-notices/:id/counter-notices').post(async (ctx: Context) => {
  assertCopyrightIntakeEnabled()
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-notices/:id/counter-notices')
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.counter-notice' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const targetIds = parseCopyrightTargetIds(body.target_ids)
  ctx.assert(
    boundedString(body.name, 200) &&
      boundedString(body.address, 4096) &&
      boundedString(body.telephone, 100) &&
      boundedString(body.electronic_signature, 500),
    422,
    'name, address, telephone, and electronic_signature are required',
  )
  const result = await createCopyrightCounterNotice(currentUser, noticeId, idempotencyKey, {
    name: body.name as string,
    address: body.address as string,
    telephone: body.telephone as string,
    consentToFederalJurisdiction: body.consent_to_federal_jurisdiction === true,
    consentToServiceOfProcess: body.consent_to_service_of_process === true,
    goodFaithMisidentificationUnderPenaltyOfPerjury:
      body.good_faith_misidentification_under_penalty_of_perjury === true,
    electronicSignature: body.electronic_signature as string,
    targetIds,
  })
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
