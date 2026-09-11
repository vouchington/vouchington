import type { Context } from '@jongleberry/api-server'
import {
  CONTRIBUTION_ADMISSION_IN_PROGRESS,
  IDENTITY_REQUIRED,
} from '@modules/on-error/error-codes'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import { assertCanContribute } from '@services/contribution-gating/assert'
import { admitRouteContribution, executePreparedContribution } from '@services/contribution-gating'
import { getUserActivePlan } from '@services/memberships'
import { assertNotSuspended } from '@services/users/suspension'
import { currentUserCanCreatePost } from '@services/posts/authorization'
import {
  assertValidCreateTopicRecommendationInput,
  prepareTopicRecommendation,
  type CreateTopicRecommendationInput,
} from '@services/wikipedia-topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'
import { apiHeaders } from '../../../response-contract.mts'

app.route('/api/v1/topic-recommendations').post(async (ctx: Context) => {
  apiHeaders('POST:/api/v1/topic-recommendations', {
    request: { 'Idempotency-Key': { type: 'string', format: 'uuid' } },
    responses: {
      409: {
        headers: { 'Retry-After': { type: 'integer' } },
        errors: [
          {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This Idempotency-Key was already used for a different request.',
          },
          {
            code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
            message: 'This contribution is still being processed. Please retry.',
          },
        ],
      },
      429: {
        errors: [
          {
            code: 'CONTRIBUTION_QUOTA_EXCEEDED',
            message: 'Contribution limit exceeded. Please try again later.',
          },
        ],
      },
    },
  })
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/topic-recommendations')
  assertNotSuspended(currentUser)
  if (!currentUserCanCreatePost(currentUser)) {
    ctx.throw(403, 'An identity is required to create posts', IDENTITY_REQUIRED)
  }

  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })
  const body: unknown = await ctx.request.json<CreateTopicRecommendationInput>('1mb')
  assertValidCreateTopicRecommendationInput(body)
  const admission = await admitRouteContribution({
    currentUser,
    membershipPlan,
    source: 'topic_recommendation',
    scope: 'topic_recommendation',
    postType: 'topic_recommendation',
    idempotencyKeyHeader: ctx.req.headers['idempotency-key'],
    intent: { route: 'topic-recommendations.create', body },
    beforeCapacity: () =>
      verifyCaptchaOrAttestation(ctx, body, { actionTag: 'topic-recommendations.create' }),
    execute: query =>
      executePreparedContribution(query, () =>
        prepareTopicRecommendation(currentUser, body, { query }),
      ),
  })
  if (admission.kind === 'in_progress') {
    ctx.set('Retry-After', String(admission.retryAfterSeconds))
    ctx.throw(
      409,
      'This contribution is still being processed. Please retry.',
      CONTRIBUTION_ADMISSION_IN_PROGRESS,
    )
  }
  ctx.setStatus(201)
  ctx.json({ post: admission.response })
})
