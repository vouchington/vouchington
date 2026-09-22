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
  getCopyrightParticipantNoticeDetail,
  getCopyrightPublicNoticeDetail,
  listAcceptedCopyrightNotices,
} from '@services/copyright-notices'
import {
  boundedString,
  parseCopyrightNoticeForm,
  parseCopyrightTargetIds,
} from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import { enqueueCopyrightFormScreeningAndWait } from '@queues/ai-agents/enqueues/copyright-form-screening'
import { enqueueCopyrightAppealRecommendationAndWait } from '@queues/ai-agents/enqueues/copyright-appeal-recommendation'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import './moderator-routes.mts'
import './staff-queue-route.mts'

const acceptedCopyrightNoticesParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 100 },
})
const acceptedCopyrightNoticesCursorScope = 'copyright-notices:accepted-at-desc-id-desc'

app.route('/api/v1/copyright-notices').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices', acceptedCopyrightNoticesParser)
  setPrivateNoStoreCacheHeaders(ctx)
  await requireAuth(ctx, 'GET:/api/v1/copyright-notices')
  const options = acceptedCopyrightNoticesParser.parse(ctx.query)
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(
        options.after,
        acceptedCopyrightNoticesCursorScope,
        'Invalid copyright notice cursor',
      )
    : undefined
  const { notices, hasNextPage } = await listAcceptedCopyrightNotices({
    limit: options.limit,
    after,
  })
  const cursorFor = (notice: (typeof notices)[number]) =>
    encodeScopedPreciseTimestampCursor(
      notice.cursor_accepted_at,
      notice.id,
      acceptedCopyrightNoticesCursorScope,
    )
  ctx.json(
    apiResponse('GET:/api/v1/copyright-notices', {
      copyright_notices: notices.map(({ cursor_accepted_at: _, ...notice }) => notice),
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: notices[0] ? cursorFor(notices[0]) : null,
        end_cursor: hasNextPage && notices.at(-1) ? cursorFor(notices.at(-1)!) : null,
      },
    }),
  )
})

app.route('/api/v1/copyright-notices/:id').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  await requireAuth(ctx, 'GET:/api/v1/copyright-notices/:id')
  const notice = await getCopyrightPublicNoticeDetail(validateUUIDParam(ctx, 'id'))
  ctx.assert(notice, 404, 'Copyright notice not found')
  ctx.json({ copyright_notice: notice })
})

app.route('/api/v1/copyright-notices/:id/participant').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/copyright-notices/:id/participant')
  const notice = await getCopyrightParticipantNoticeDetail(
    validateUUIDParam(ctx, 'id'),
    currentUser,
  )
  ctx.assert(notice, 403, 'You are not a participant in this copyright notice')
  ctx.json({ copyright_notice: notice })
})

app.route('/api/v1/copyright-notices').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
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
  setPrivateNoStoreCacheHeaders(ctx)
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
