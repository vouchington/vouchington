import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanReviewCopyrightNotices,
  listCopyrightRepeatInfringerAccountsForNotice,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
  recordStaffCopyrightRepeatInfringerDisposition,
  type CopyrightRepeatInfringerReviewDecision,
} from '@services/copyright-notices'
import { boundedString } from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'

const reviewDecisions = new Set<CopyrightRepeatInfringerReviewDecision>([
  'warning',
  'no_action',
  'restrict',
  'terminate',
])
const dispositions = new Set(['withdrawn', 'duplicate', 'abusive'])

app.route('/api/v1/copyright-notices/:id/repeat-infringer-accounts').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-notices/:id/repeat-infringer-accounts',
  )
  assertNotSuspended(currentUser)
  ctx.json({
    copyright_repeat_infringer_accounts: await listCopyrightRepeatInfringerAccountsForNotice(
      currentUser,
      validateUUIDParam(ctx, 'id'),
    ),
  })
})

app
  .route('/api/v1/copyright-repeat-infringer-incidents/:id/dispositions')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-repeat-infringer-incidents/:id/dispositions',
    )
    assertNotSuspended(currentUser)
    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    ctx.assert(
      typeof body.disposition === 'string' && dispositions.has(body.disposition),
      422,
      'disposition must be withdrawn, duplicate, or abusive',
    )
    ctx.json({
      copyright_repeat_infringer_disposition: await recordStaffCopyrightRepeatInfringerDisposition({
        currentUser,
        incidentId: validateUUIDParam(ctx, 'id'),
        disposition: body.disposition as 'withdrawn' | 'duplicate' | 'abusive',
        rationale: body.rationale,
        recordedAt: new Date(),
      }),
    })
  })

app.route('/api/v1/copyright-repeat-infringer-reviews/:id/outcomes').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-repeat-infringer-reviews/:id/outcomes',
  )
  assertNotSuspended(currentUser)
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
  ctx.assert(
    typeof body.outcome === 'string' &&
      reviewDecisions.has(body.outcome as CopyrightRepeatInfringerReviewDecision),
    422,
    'outcome must be warning, no_action, restrict, or terminate',
  )
  ctx.json({
    copyright_repeat_infringer_review: await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser,
      reviewId: validateUUIDParam(ctx, 'id'),
      outcome: body.outcome as CopyrightRepeatInfringerReviewDecision,
      rationale: body.rationale,
      recordedAt: new Date(),
    }),
  })
})

app
  .route('/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements',
    )
    assertNotSuspended(currentUser)
    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    ctx.json({
      copyright_repeat_infringer_review: await recordCopyrightRepeatInfringerReinstatement({
        currentUser,
        accountUserId: validateUUIDParam(ctx, 'accountUserId'),
        rationale: body.rationale,
        recordedAt: new Date(),
      }),
    })
  })
