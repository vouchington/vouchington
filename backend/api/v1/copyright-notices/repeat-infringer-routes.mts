import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanReviewCopyrightNotices,
  listCopyrightRepeatInfringerAccountsForNotice,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
  recordStaffCopyrightRepeatInfringerDisposition,
} from '@services/copyright-notices'
import { boundedString } from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import type {
  CopyrightRepeatInfringerDispositionRequest,
  CopyrightRepeatInfringerOutcomeRequest,
  CopyrightRepeatInfringerReinstatementRequest,
} from './repeat-infringer-request-types.mts'

const reviewDecisions = new Set<CopyrightRepeatInfringerOutcomeRequest['outcome']>([
  'warning',
  'no_action',
  'restrict',
  'terminate',
])
const dispositions = new Set<CopyrightRepeatInfringerDispositionRequest['disposition']>([
  'withdrawn',
  'duplicate',
  'abusive',
])

// A JSON `null`, array or scalar has no fields to read; refuse it before the first field read so it
// answers 422 instead of throwing a TypeError (500). Each handler keeps its own typed
// `ctx.request.json` cast, which is how the request-contract compiler finds the body type.
function assertObjectBody(ctx: Context, body: unknown) {
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    422,
    'Invalid request body',
  )
}

// Every handler keeps its admission order (content type, authentication and role, rate limit,
// suspension, non-object body, field-named parsers, path id) and adds the generated contract
// immediately before the first service call.
app.route('/api/v1/copyright-notices/:id/repeat-infringer-accounts').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-notices/:id/repeat-infringer-accounts',
  )
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-notices/:id/repeat-infringer-accounts', {
    path: ctx.params,
  })
  ctx.json({
    copyright_repeat_infringer_accounts: await listCopyrightRepeatInfringerAccountsForNotice(
      currentUser,
      noticeId,
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
    const body = (await ctx.request.json('1mb')) as CopyrightRepeatInfringerDispositionRequest
    assertObjectBody(ctx, body)
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    ctx.assert(
      dispositions.has(body.disposition),
      422,
      'disposition must be withdrawn, duplicate, or abusive',
    )
    const incidentId = validateUUIDParam(ctx, 'id')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-repeat-infringer-incidents/:id/dispositions',
      { path: ctx.params, body },
    )
    ctx.json({
      copyright_repeat_infringer_disposition: await recordStaffCopyrightRepeatInfringerDisposition({
        currentUser,
        incidentId,
        disposition: body.disposition,
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
  const body = (await ctx.request.json('1mb')) as CopyrightRepeatInfringerOutcomeRequest
  assertObjectBody(ctx, body)
  ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
  ctx.assert(
    reviewDecisions.has(body.outcome),
    422,
    'outcome must be warning, no_action, restrict, or terminate',
  )
  const reviewId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-repeat-infringer-reviews/:id/outcomes', {
    path: ctx.params,
    body,
  })
  ctx.json({
    copyright_repeat_infringer_review: await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser,
      reviewId,
      outcome: body.outcome,
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
    const body = (await ctx.request.json('1mb')) as CopyrightRepeatInfringerReinstatementRequest
    assertObjectBody(ctx, body)
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    const accountUserId = validateUUIDParam(ctx, 'accountUserId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements',
      { path: ctx.params, body },
    )
    ctx.json({
      copyright_repeat_infringer_review: await recordCopyrightRepeatInfringerReinstatement({
        currentUser,
        accountUserId,
        rationale: body.rationale,
        recordedAt: new Date(),
      }),
    })
  })
