import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  acknowledgeEuCopyrightNotice,
  assertCopyrightIntakeEnabled,
  compileEuCopyrightTransparencyReport,
  currentUserCanReviewCopyrightNotices,
  receiveEuCopyrightNotice,
  recordEuCopyrightAcknowledgmentFailure,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  recordEuCopyrightSupervisedComplaint,
  submitEuCopyrightRedress,
} from '@services/copyright-notices'
import {
  parseTerritorialNoticeBody,
  parseTerritorialRedressDecision,
  parseTerritorialReportPeriod,
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

app.route('/api/v1/copyright-eu-notices').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  assertCopyrightIntakeEnabled()
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-eu-notices')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-eu-notices.create' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const receipt = await receiveEuCopyrightNotice(
    currentUser,
    idempotencyKey,
    parseTerritorialNoticeBody(body),
  )
  const acknowledgment = await acknowledgeEuCopyrightNotice(currentUser, receipt.notice_id)
  ctx.setStatus(receipt.is_duplicate ? 200 : 201)
  ctx.json({ copyright_eu_notice: receipt, acknowledgment })
})

app.route('/api/v1/copyright-eu-notices/:id/acknowledgment-failures').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-eu-notices/:id/acknowledgment-failures',
  )
  assertNotSuspended(currentUser)
  const acknowledgment = await recordEuCopyrightAcknowledgmentFailure(
    currentUser,
    validateUUIDParam(ctx, 'id'),
  )
  ctx.json({ acknowledgment })
})

app.route('/api/v1/copyright-eu-notices/:id/statements-of-reasons').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-eu-notices/:id/statements-of-reasons',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const statement = await recordEuCopyrightStatementOfReasons(
    currentUser,
    validateUUIDParam(ctx, 'id'),
    parseTerritorialText(body, 'statement'),
  )
  ctx.setStatus(201)
  ctx.json({ copyright_eu_statement_of_reasons: statement })
})

app.route('/api/v1/copyright-eu-notices/:id/redress-requests').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/copyright-eu-notices/:id/redress-requests',
  )
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-eu-redress.create' })
  const redress = await submitEuCopyrightRedress(
    currentUser,
    validateUUIDParam(ctx, 'id'),
    requireIdempotencyKey(ctx),
    parseTerritorialText(body, 'explanation'),
  )
  ctx.setStatus(redress.is_duplicate ? 200 : 201)
  ctx.json({ copyright_eu_redress_request: redress })
})

app
  .route('/api/v1/copyright-eu-notices/:id/redress-requests/:redressId/decisions')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-eu-notices/:id/redress-requests/:redressId/decisions',
    )
    assertNotSuspended(currentUser)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const body = await parseJsonBody<Record<string, unknown>>(ctx)
    const decision = await recordEuCopyrightRedressDecision(
      currentUser,
      validateUUIDParam(ctx, 'id'),
      validateUUIDParam(ctx, 'redressId'),
      parseTerritorialRedressDecision(body),
    )
    ctx.setStatus(201)
    ctx.json({ copyright_eu_redress_decision: decision })
  })

app.route('/api/v1/copyright-eu-notices/:id/supervised-complaints').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/copyright-eu-notices/:id/supervised-complaints',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const complaint = await recordEuCopyrightSupervisedComplaint(
    currentUser,
    validateUUIDParam(ctx, 'id'),
    {
      authorityReference: parseTerritorialText(body, 'authority_reference'),
      explanation: parseTerritorialText(body, 'explanation'),
    },
  )
  ctx.setStatus(201)
  ctx.json({ copyright_eu_supervised_complaint: complaint })
})

app.route('/api/v1/copyright-eu-reports').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-eu-reports',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const period = parseTerritorialReportPeriod(body)
  const report = await compileEuCopyrightTransparencyReport(
    currentUser,
    period.periodStartedAt,
    period.periodEndedAt,
  )
  ctx.setStatus(201)
  ctx.json({ copyright_eu_report: report })
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
