import type { Context } from '@jongleberry/api-server'
import {
  CONTRIBUTION_ADMISSION_IN_PROGRESS,
  IDENTITY_REQUIRED,
} from '@modules/on-error/error-codes'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import { assessRecaptchaToken } from '@services/recaptcha'
import { assertCanContribute } from '@services/contribution-gating/assert'
import {
  admitRouteContribution,
  contributionPolicySourceForPostType,
  executePreparedContribution,
} from '@services/contribution-gating'
import { isHoneypotTriggered } from '@services/honeypot'
import { getUserActivePlan } from '@services/memberships'
import { preparePostWithCommunityReviews, type CreatePostInput } from '@services/posts'
import { isSupportedPostType, validateCreatePostInput } from '@services/posts/create/validation'
import { assertCanCreateAdminOnlyPostType } from '@services/posts/create/admin-only-post-type'
import {
  assertOfficialAccountCanCreatePost,
  currentUserCanCreatePost,
} from '@services/posts/authorization'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { mintUUIDv7 } from '@ts-shared/session-jwt'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { apiHeaders, apiRequestContract } from '../../../response-contract.mts'

type CreatePostRequestBody = CreatePostInput & {
  hp_website?: string
  hp_phone?: string
  cf_turnstile_response?: string
  recaptcha_token?: string
}

app.route('/api/v1/posts').post(async (ctx: Context) => {
  apiRequestContract<'POST:/api/v1/posts', CreatePostRequestBody>('POST:/api/v1/posts')
  apiHeaders('POST:/api/v1/posts', {
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
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/posts')
  assertNotSuspended(currentUser)
  if (!currentUserCanCreatePost(currentUser)) {
    ctx.throw(403, 'An identity is required to create posts', IDENTITY_REQUIRED)
  }

  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })

  const parsedBody = await ctx.request.json('1mb')
  ctx.assert(
    parsedBody !== null && typeof parsedBody === 'object' && !Array.isArray(parsedBody),
    422,
    'Invalid request body',
  )
  const body = parsedBody as CreatePostRequestBody

  if (isHoneypotTriggered(body as Record<string, unknown>)) {
    const now = new Date().toISOString()
    ctx.setStatus(201)
    ctx.json({
      post: {
        id: mintUUIDv7(),
        post_type: body.post_type ?? 'discussion',
        title: body.title ?? '',
        markdown: body.markdown ?? '',
        ai_summary_markdown: '',
        parent_id: null,
        root_id: null,
        community_id: null,
        created_by_id: currentUser.id,
        broadcast: body.broadcast ?? 'everyone',
        privacy: body.privacy ?? 'public',
        is_anonymous: body.is_anonymous ?? false,
        deleted_at: null,
        deleted_by_id: null,
        archived_at: null,
        archived_by_id: null,
        updated_by_id: null,
        clearance_status: 'pending',
        clearance_updated_at: null,
        created_at: now,
        updated_at: now,
      },
    })
    return
  }

  ctx.assert(
    body.community_id === undefined,
    422,
    'Use the community posts endpoint to create community posts',
  )
  const admissionPostType = isSupportedPostType(body.post_type)
    ? body.post_type
    : body.post_type === undefined
      ? 'discussion'
      : 'invalid'
  let isBareOneClickLink = false
  const admission = await admitRouteContribution({
    currentUser,
    membershipPlan,
    source: contributionPolicySourceForPostType(admissionPostType, isAdminUser(currentUser)),
    scope: 'global',
    postType: admissionPostType,
    idempotencyKeyHeader: ctx.req.headers['idempotency-key'],
    intent: { route: 'posts.create', body },
    beforeCapacity: async () => {
      // Validation includes mutable topic/category and URL lookups. Keep it after the durable
      // admission claim so committed retries can replay even when referenced entities changed.
      // Newly claimed requests still validate before challenge verification and mutation.
      ctx.assert(
        body.slug === undefined || isAdminUser(currentUser),
        403,
        'Only admins can set a post slug',
      )
      assertCanCreateAdminOnlyPostType(currentUser, body.post_type ?? 'discussion')
      assertOfficialAccountCanCreatePost(currentUser, body.post_type)
      validateRequestContract(ctx, 'POST:/api/v1/posts', { body })
      // The generated contract establishes string/array shape before inspecting user text.
      isBareOneClickLink =
        body.post_type === 'link' &&
        !!body.url_id &&
        !body.url &&
        !body.title?.trim() &&
        !body.markdown?.trim() &&
        !body.images?.length
      await validateCreatePostInput(currentUser, body, membershipPlan)
      if (!isBareOneClickLink)
        await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'posts.create' })
    },
    beforeCommit: () =>
      assessRecaptchaToken({
        currentUser,
        token: body.recaptcha_token,
        expectedAction: body.post_type === 'comment' ? 'create_comment' : 'create_post',
        ip: ctx.ip,
      }),
    execute: query =>
      executePreparedContribution(query, async () => {
        const prepared = await preparePostWithCommunityReviews(currentUser, body, membershipPlan, {
          query,
        })
        return {
          response: prepared.response.post,
          finalize: async () => (await prepared.finalize()).post,
        }
      }),
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
