import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanReviewCopyrightNotices,
  recordEuDisputeSettlementReferral,
  recordEuDisputeSettlementOutcome,
  recordEuDisputeSettlementImplementation,
} from '@services/copyright-notices'
import {
  parseEuDisputeSettlementReferral,
  parseEuDisputeSettlementOutcome,
  parseEuDisputeSettlementDate,
} from '@services/copyright-notices/eu-dispute-settlement-http-input'
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
  CopyrightEuDisputeSettlementReferralRequest,
  CopyrightEuDisputeSettlementOutcomeRequest,
  CopyrightEuDisputeSettlementImplementationRequest,
} from './territorial-request-types.mts'

app.route('/api/v1/copyright-eu-notices/:id/dispute-settlements').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightEuDisputeSettlementReferralRequest>(ctx)
  const noticeId = validateUUIDParam(ctx, 'id')
  const input = parseEuDisputeSettlementReferral(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements', {
    path: ctx.params,
    body,
  })
  const referral = await recordEuDisputeSettlementReferral(currentUser, noticeId, input)
  ctx.setStatus(201)
  ctx.json({ copyright_eu_dispute_settlement_referral: referral })
})

app
  .route('/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/outcomes')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/outcomes',
    )
    assertNotSuspended(currentUser)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const body = await parseJsonBody<CopyrightEuDisputeSettlementOutcomeRequest>(ctx)
    const noticeId = validateUUIDParam(ctx, 'id')
    const referralId = validateUUIDParam(ctx, 'referralId')
    const input = parseEuDisputeSettlementOutcome(body)
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/outcomes',
      {
        path: ctx.params,
        body,
      },
    )
    const outcome = await recordEuDisputeSettlementOutcome(currentUser, noticeId, referralId, input)
    ctx.setStatus(201)
    ctx.json({ copyright_eu_dispute_settlement_outcome: outcome })
  })

app
  .route('/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/implementations')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/implementations',
    )
    assertNotSuspended(currentUser)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const body = await parseJsonBody<CopyrightEuDisputeSettlementImplementationRequest>(ctx)
    const noticeId = validateUUIDParam(ctx, 'id')
    const referralId = validateUUIDParam(ctx, 'referralId')
    const implementedAt = parseEuDisputeSettlementDate(body.implemented_at, 'implemented_at')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/implementations',
      {
        path: ctx.params,
        body,
      },
    )
    const implementation = await recordEuDisputeSettlementImplementation(
      currentUser,
      noticeId,
      referralId,
      implementedAt,
    )
    ctx.setStatus(201)
    ctx.json({ copyright_eu_dispute_settlement_implementation: implementation })
  })
