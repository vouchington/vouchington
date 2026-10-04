import './eu-copyright-dispute-settlement-routes.mts'
import type { Context } from '@jongleberry/api-server'
import {
  compileEuCopyrightTransparencyReport,
  currentUserCanReviewCopyrightNotices,
  recordEuCopyrightAcknowledgmentFailure,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
} from '@services/copyright-notices'
import {
  parseTerritorialDecisionBody,
  parseTerritorialRedressDecision,
  parseTerritorialReportPeriod,
} from '@services/copyright-notices/territorial-http-input'
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
  CopyrightTerritorialRedressDecisionRequest,
  CopyrightTerritorialReportRequest,
  CopyrightTerritorialStatementRequest,
} from './territorial-request-types.mts'

// Every handler keeps its admission order (authentication and staff role, rate limit, suspension,
// content type, field-named parsers, path id) and adds the generated contract immediately before
// the first service call. A caller without the staff role never reaches the contract.
app.route('/api/v1/copyright-eu-notices/:id/acknowledgment-failures').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-eu-notices/:id/acknowledgment-failures',
  )
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-eu-notices/:id/acknowledgment-failures', {
    path: ctx.params,
  })
  const acknowledgment = await recordEuCopyrightAcknowledgmentFailure(currentUser, noticeId)
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
  const body = await parseJsonBody<CopyrightTerritorialStatementRequest>(ctx)
  const noticeId = validateUUIDParam(ctx, 'id')
  const input = parseTerritorialDecisionBody(body, 'statement')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-eu-notices/:id/statements-of-reasons', {
    path: ctx.params,
    body,
  })
  const statement = await recordEuCopyrightStatementOfReasons(currentUser, noticeId, input)
  ctx.setStatus(201)
  ctx.json({ copyright_eu_statement_of_reasons: statement })
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
    const body = await parseJsonBody<CopyrightTerritorialRedressDecisionRequest>(ctx)
    const noticeId = validateUUIDParam(ctx, 'id')
    const redressId = validateUUIDParam(ctx, 'redressId')
    const input = parseTerritorialRedressDecision(body)
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-eu-notices/:id/redress-requests/:redressId/decisions',
      { path: ctx.params, body },
    )
    const decision = await recordEuCopyrightRedressDecision(currentUser, noticeId, redressId, input)
    ctx.setStatus(201)
    ctx.json({ copyright_eu_redress_decision: decision })
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
  const body = await parseJsonBody<CopyrightTerritorialReportRequest>(ctx)
  const period = parseTerritorialReportPeriod(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-eu-reports', { body })
  const report = await compileEuCopyrightTransparencyReport(
    currentUser,
    period.periodStartedAt,
    period.periodEndedAt,
  )
  ctx.setStatus(201)
  ctx.json({ copyright_eu_report: report })
})
