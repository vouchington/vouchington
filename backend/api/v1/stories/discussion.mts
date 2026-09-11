import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { prepareStoryPost } from '@services/stories/story-posts'
import {
  assertStoryIsDiscoverable,
  currentUserCanCreateStoryPost,
} from '@services/stories/authorization'
import { assertCanContribute } from '@services/contribution-gating/assert'
import { admitRouteContribution, executePreparedContribution } from '@services/contribution-gating'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS } from '@modules/on-error/error-codes'
import { getUserActivePlan } from '@services/memberships'
import { assertNotSuspended } from '@services/users'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { apiHeaders } from '../../response-contract.mts'

/**
 * POST /api/v1/stories/:storyId/discussions
 * Creates a discussion post from a story, linking all item URLs and forwarding categories.
 * Restricted to stories whose source RSS feed is discoverable; non-discoverable stories must
 * use the regular post creation flow with the article URL pre-linked.
 */
app.route('/api/v1/stories/:storyId/discussions').post(async (ctx: Context) => {
  apiHeaders('POST:/api/v1/stories/:storyId/discussions', {
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
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanCreateStoryPost,
    'POST:/api/v1/stories/:storyId/discussions',
  )
  assertNotSuspended(currentUser)

  const storyId = ctx.params.storyId!
  ctx.assert(isUUID(storyId), 400, 'Invalid story ID')

  // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })
  const admission = await admitRouteContribution({
    currentUser,
    membershipPlan,
    source: 'story',
    scope: `story:${storyId}`,
    postType: 'story',
    idempotencyKeyHeader: ctx.req.headers['idempotency-key'],
    intent: { route: 'stories.discussions.create', story_id: storyId },
    beforeCommit: () => assertStoryIsDiscoverable(storyId),
    execute: query =>
      executePreparedContribution(query, () => prepareStoryPost(storyId, currentUser, { query })),
  })
  if (admission.kind === 'in_progress') {
    ctx.set('Retry-After', String(admission.retryAfterSeconds))
    ctx.throw(
      409,
      'This contribution is still being processed. Please retry.',
      CONTRIBUTION_ADMISSION_IN_PROGRESS,
    )
  }
  ctx.json(admission.response)
})
