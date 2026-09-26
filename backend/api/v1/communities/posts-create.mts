import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { apiHeaders } from '../../response-contract.mts'
import {
  communityAllowsPostType,
  getCommunityOrThrow,
  isCommunityRootPostType,
  loadCommunityForViewer,
} from '@services/communities'
import { preparePostWithCommunityReviews, type CreatePostInput } from '@services/posts'
import { validateCreatePostInput } from '@services/posts/create/validation'
import { currentUserCanCreatePost } from '@services/posts/authorization'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { getUserActivePlan } from '@services/memberships'
import { assertCanContribute } from '@services/contribution-gating/assert'
import {
  admitRouteContribution,
  contributionPolicySourceForPostType,
  executePreparedContribution,
} from '@services/contribution-gating'
import {
  CONTRIBUTION_ADMISSION_IN_PROGRESS,
  IDENTITY_REQUIRED,
} from '@modules/on-error/error-codes'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import { assessRecaptchaToken } from '@services/recaptcha'
import { isHoneypotTriggered } from '@services/honeypot'
import { sendCommunityPostHoneypotResponse } from './posts-honeypot-response.mts'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

app.route('/api/v1/communities/:idOrSlug/posts').post(async (ctx: Context) => {
  apiHeaders('POST:/api/v1/communities/:idOrSlug/posts', {
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
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/posts')
  const provenance = getRequestContentProvenance()
  assertNotSuspended(currentUser)
  if (!currentUserCanCreatePost(currentUser)) {
    ctx.throw(403, 'An identity is required to create posts', IDENTITY_REQUIRED)
  }

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
  const { community } = await loadCommunityForViewer(currentUser, idOrSlug)

  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })

  const body = (await ctx.request.json('1mb')) as CreatePostInput & {
    hp_website?: string
    hp_phone?: string
    cf_turnstile_response?: string
    recaptcha_token?: string
  }

  if (isHoneypotTriggered(body as Record<string, unknown>)) {
    sendCommunityPostHoneypotResponse(ctx, body, community.id, currentUser.id)
    return
  }

  ctx.assert(!body.community_id || body.community_id === community.id, 422, 'Invalid community_id')
  const postType = body.post_type ?? 'discussion'
  ctx.assert(isCommunityRootPostType(postType), 422, 'Unsupported community post_type')
  const input = { ...body, community_id: community.id }
  const admission = await admitRouteContribution({
    currentUser,
    membershipPlan,
    source: contributionPolicySourceForPostType(body.post_type),
    scope: `community:${community.id}`,
    postType: body.post_type ?? 'discussion',
    idempotencyKeyHeader: ctx.req.headers['idempotency-key'],
    intent: { route: 'communities.posts.create', community_id: community.id, body: input },
    beforeCapacity: async () => {
      const currentCommunity = await getCommunityOrThrow(community.id, { readOnly: false })
      ctx.assert(
        communityAllowsPostType(currentCommunity, postType),
        403,
        `${postType} posts are not enabled for this community`,
      )
      ctx.assert(
        body.slug === undefined || isAdminUser(currentUser),
        403,
        'Only admins can set a post slug',
      )
      await validateCreatePostInput(currentUser, input, membershipPlan)
      await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'communities.create-post' })
    },
    beforeCommit: () =>
      assessRecaptchaToken({
        currentUser,
        token: body.recaptcha_token,
        expectedAction: body.post_type === 'comment' ? 'create_comment' : 'create_post',
        ip: ctx.ip,
      }),
    execute: query =>
      executePreparedContribution(query, () =>
        preparePostWithCommunityReviews(provenance, currentUser, input, membershipPlan, { query }),
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
  const { post, communityReviews } = admission.response
  const communityReview = communityReviews.find(review => review.community_id === community.id)

  ctx.setStatus(201)
  ctx.json({
    post,
    community_post_review: communityReview
      ? {
          community_id: communityReview.community_id,
          post_id: communityReview.post_id,
          approved_at: communityReview.approved_at,
          rejected_at: communityReview.rejected_at,
          unpublished_at: communityReview.unpublished_at,
        }
      : null,
  })
})
