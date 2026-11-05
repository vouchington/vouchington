import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  completeCopyrightMandatoryHumanReview,
  currentUserCanLiftCopyrightRestriction,
  currentUserCanReviewCopyrightNotices,
  liftCopyrightRestrictionWithoutSetter,
  replayFailedCopyrightActionIntent,
} from '@services/copyright-notices'
import { boundedString } from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiNoRequestBody, apiRequestContract } from '@vouchington/utils/api-response-contract'
import type {
  CopyrightRestrictionLiftRequest,
  CopyrightRestrictionReviewRequest,
} from './staff-decision-request-types.mts'

app
  .route('/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const restrictionId = validateUUIDParam(ctx, 'restrictionId')
    const body = (await parseJsonBody(ctx, '1mb')) as CopyrightRestrictionReviewRequest
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    ctx.assert(
      body.action === 'confirm' || body.action === 'reverse',
      422,
      'action must be confirm or reverse',
    )
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews',
      { path: ctx.params, body },
    )
    const restriction = await completeCopyrightMandatoryHumanReview({
      currentUser,
      noticeId,
      restrictionId,
      action: body.action,
      rationale: body.rationale,
      reviewedAt: new Date(),
    })
    ctx.json({ copyright_restriction: restriction })
  })

app
  .route('/api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts')
  .post(async (ctx: Context) => {
    apiRequestContract<
      'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts',
      CopyrightRestrictionLiftRequest
    >('POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts')
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanLiftCopyrightRestriction,
      'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts',
    )
    assertNotSuspended(currentUser)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const noticeId = validateUUIDParam(ctx, 'id')
    const restrictionId = validateUUIDParam(ctx, 'restrictionId')
    const body = (await parseJsonBody(ctx, '1mb')) as CopyrightRestrictionLiftRequest
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts',
      { path: ctx.params, body },
    )
    const lift = await liftCopyrightRestrictionWithoutSetter({
      currentUser,
      noticeId,
      restrictionId,
      rationale: body.rationale,
      liftedAt: new Date(),
    })
    ctx.setStatus(201)
    ctx.json({ copyright_restriction_lift: { id: lift.id } })
  })

app
  .route('/api/v1/copyright-notices/:id/action-intents/:intentId/replays')
  .post(async (ctx: Context) => {
    apiNoRequestBody('POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays')
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const intentId = validateUUIDParam(ctx, 'intentId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays',
      { path: ctx.params },
    )
    const replayed = await replayFailedCopyrightActionIntent({
      intentId,
      noticeId,
      actorUserId: currentUser.id,
    })
    ctx.json({ replayed })
  })
