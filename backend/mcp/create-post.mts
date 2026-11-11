import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import { isAdminUser } from '@services/users'
import {
  loadCommunityForViewer,
  communityAllowsPostType,
  isCommunityRootPostType,
} from '@services/communities'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { createCodedError } from '@vouchington/sentry'
import { IDENTITY_REQUIRED } from '@modules/on-error/error-codes'
import {
  admitDelegatedContribution,
  executePreparedContribution,
} from '@services/contribution-gating'
import { preparePostWithCommunityReviews, type CreatePostInput, type Post } from '@services/posts'
import {
  preparePostWrite,
  validatePostWriteInput,
  currentUserCanCreatePostWrite,
  postWriteAdmission,
  assertPostWriteBeforeCommit,
} from '@services/post-writes'
import { assertCanCreateAdminOnlyPostType } from '@services/posts/create/admin-only-post-type'
import {
  assertOfficialAccountCanCreatePost,
  getAuthorizedPostContributionMembershipPlan,
} from '@services/posts/authorization'
import type { Tool } from '@services/openai-agents/tool-types'
import {
  canonicalEntityId,
  canonicalEntityIds,
  MISSING_REFERENCE_ID,
} from './resolve-entity-reference.mts'

import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { requireActiveToolUser } from './private-user.mts'
import { toWrittenMcpPost, type McpPostSummary as McpPost } from './mcp-post-output.mts'
import {
  loadWritablePost,
  postCreateParameters,
  POST_WRITE_SCOPES,
  POST_WRITE_RESULT_SCHEMA,
} from './post-write-tool-support.mts'

type AdmittedPost = Post | Awaited<ReturnType<typeof preparePostWithCommunityReviews>>['response']
type Args = CreatePostInput & { idempotency_key: string }
const parameters = postCreateParameters()

const tool: Tool<Args, { success: true; post: McpPost }> = {
  schema: {
    name: 'create_post',
    type: 'function',
    description:
      'Create a post, or reply with post_type comment and parent_post_id. Send community_id for a community root post. Use story_id with post_type story, rss_feed_item_id with post_type link, and topic proposal fields with post_type topic_recommendation. Reuse the UUID idempotency_key with the same body to retry safely.',
    parameters: {
      ...parameters,
      properties: {
        ...parameters.properties,
        idempotency_key: {
          type: 'string',
          format: 'uuid',
        },
      },
      required: ['idempotency_key'],
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Create Post or Comment',
    plan: 'plus',
    requiredScopes: POST_WRITE_SCOPES,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [
      { method: 'POST', path: '/api/v1/posts' },
      { method: 'POST', path: '/api/v1/communities/:idOrSlug/posts' },
    ],
    // `community_id` picks the community route, as in `function` below. Without it the call
    // exercises only the global route.
    selectApi: args => [
      args.community_id
        ? { method: 'POST', path: '/api/v1/communities/:idOrSlug/posts' }
        : { method: 'POST', path: '/api/v1/posts' },
    ],
    outputSchema: POST_WRITE_RESULT_SCHEMA,
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    const authority = getDelegatedToolAuthority(user, invocationContext)
    if (!currentUserCanCreatePostWrite(user, args))
      throw createCodedError(403, 'An identity is required to create posts', IDENTITY_REQUIRED)
    const membershipPlan = await getAuthorizedPostContributionMembershipPlan(user)
    const { idempotency_key, ...body } = args
    let communityId = body.community_id
    if (communityId) {
      communityId = (await canonicalEntityId('community', communityId)) ?? MISSING_REFERENCE_ID
      body.community_id = communityId
      validateUUID(communityId)
    }
    if (body.parent_post_id) {
      body.parent_post_id =
        (await canonicalEntityId('post', body.parent_post_id)) ?? MISSING_REFERENCE_ID
    }
    if (body.review_topic_ratings?.length) {
      const topicIds = await canonicalEntityIds(
        'topic',
        body.review_topic_ratings.map(rating => rating.topic_id),
      )
      body.review_topic_ratings = body.review_topic_ratings.map((rating, index) => ({
        ...rating,
        topic_id: topicIds[index] ?? MISSING_REFERENCE_ID,
      }))
    }
    const postType = body.post_type ?? 'discussion'
    if (communityId) {
      assert(isCommunityRootPostType(postType), 422, 'Unsupported community post_type')
    }
    let rssFeedItem: Awaited<ReturnType<typeof validatePostWriteInput>>
    const admitted = await admitDelegatedContribution<AdmittedPost>({
      authority,
      currentUser: user,
      membershipPlan,
      ...postWriteAdmission(body, isAdminUser(user)),
      postType,
      idempotencyKey: idempotency_key,
      intent: communityId
        ? { route: 'communities.posts.create', community_id: communityId, body }
        : { route: 'posts.create', body },
      beforeCapacity: async () => {
        assert(
          postType !== 'comment' || (body.broadcast === undefined && body.privacy === undefined),
          422,
          'Comments inherit their thread audience',
        )
        assert(body.url == null || body.url_id == null, 422, 'Send either url or url_id, not both')
        if (communityId) {
          const { community: currentCommunity } = await loadCommunityForViewer(user, communityId, {
            readOnly: false,
          })
          assert(
            isCommunityRootPostType(postType) &&
              communityAllowsPostType(currentCommunity, postType),
            403,
            `${postType} posts are not enabled for this community`,
          )
        }
        assert(body.slug === undefined || isAdminUser(user), 403, 'Only admins can set a post slug')
        assertCanCreateAdminOnlyPostType(user, postType)
        assertOfficialAccountCanCreatePost(user, body.post_type)
        rssFeedItem = await validatePostWriteInput(user, body, membershipPlan)
        if (body.parent_post_id) await loadWritablePost(user, body.parent_post_id, 'reply')
      },
      beforeCommit: () => assertPostWriteBeforeCommit(body),
      execute: query =>
        executePreparedContribution<AdmittedPost>(query, async () => {
          const prepared = await preparePostWrite(
            user,
            getRequestContentProvenance(),
            body,
            membershipPlan,
            { query, delegated: true, rssFeedItem },
          )
          if (communityId) return prepared
          return {
            response: prepared.response.post,
            finalize: async () => (await prepared.finalize()).post,
          }
        }),
    })
    const post = 'post' in admitted ? admitted.post : admitted
    return { success: true, post: await toWrittenMcpPost(post) }
  },
}

export default tool
