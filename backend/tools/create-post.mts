import assert from 'http-assert'
import { isAdminUser } from '@services/users'
import {
  loadCommunityForViewer,
  getCommunityOrThrow,
  communityAllowsPostType,
  isCommunityRootPostType,
} from '@services/communities'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDENTITY_REQUIRED } from '@modules/on-error/error-codes'
import {
  admitDelegatedContribution,
  contributionPolicySourceForPostType,
  executePreparedContribution,
} from '@services/contribution-gating'
import { preparePostWithCommunityReviews, type CreatePostInput, type Post } from '@services/posts'
import { validateCreatePostInput } from '@services/posts/create/validation'
import { assertCanCreateAdminOnlyPostType } from '@services/posts/create/admin-only-post-type'
import {
  assertOfficialAccountCanCreatePost,
  currentUserCanCreatePost,
  getAuthorizedPostContributionMembershipPlan,
} from '@services/posts/authorization'
import type { Tool } from '@services/openai-agents/tool-types'
import { requireActiveToolUser } from './private-user.mts'
import { toMcpPost, type McpPost } from './mcp-post-output.mts'
import {
  loadWritablePost,
  postWriteParameters,
  POST_WRITE_SCOPES,
  POST_WRITE_RESULT_SCHEMA,
} from './post-write-tool-support.mts'

type AdmittedPost = Post | Awaited<ReturnType<typeof preparePostWithCommunityReviews>>['response']
type Args = CreatePostInput & { idempotency_key: string }
const parameters = postWriteParameters('POST:/api/v1/posts')

const tool: Tool<Args, { success: true; post: McpPost }> = {
  schema: {
    name: 'create_post',
    type: 'function',
    description:
      'Create a post, or reply with post_type comment and parent_id. Send community_id for a community root post. Story and topic recommendation posts use dedicated workflows. Reuse the UUID idempotency_key with the same body to retry safely.',
    parameters: {
      ...parameters,
      properties: {
        ...parameters.properties,
        idempotency_key: {
          type: 'string',
          format: 'uuid',
          description: 'A UUID for this submission and its retries.',
        },
      },
      required: ['idempotency_key'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Create Post or Comment',
    plan: 'plus',
    requiredScopes: { mcp: POST_WRITE_SCOPES },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [
      { method: 'POST', path: '/api/v1/posts' },
      { method: 'POST', path: '/api/v1/communities/:idOrSlug/posts' },
    ],
    outputSchema: POST_WRITE_RESULT_SCHEMA,
  },
  function: currentUser => async args => {
    const user = await requireActiveToolUser(currentUser)
    if (!currentUserCanCreatePost(user))
      throw createCodedError(403, 'An identity is required to create posts', IDENTITY_REQUIRED)
    const membershipPlan = await getAuthorizedPostContributionMembershipPlan(user)
    const { idempotency_key, ...body } = args
    const community = body.community_id
      ? (await loadCommunityForViewer(user, body.community_id)).community
      : null
    const postType = body.post_type ?? 'discussion'
    if (community) {
      assert(isCommunityRootPostType(postType), 422, 'Unsupported community post_type')
      body.community_id = community.id
    }
    const admitted = await admitDelegatedContribution<AdmittedPost>({
      currentUser: user,
      membershipPlan,
      source: contributionPolicySourceForPostType(postType, isAdminUser(user)),
      scope: community ? `community:${community.id}` : 'global',
      postType,
      idempotencyKey: idempotency_key,
      intent: community
        ? { route: 'communities.posts.create', community_id: community.id, body }
        : { route: 'posts.create', body },
      beforeCapacity: async () => {
        if (community) {
          const currentCommunity = await getCommunityOrThrow(community.id, { readOnly: false })
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
        await validateCreatePostInput(user, body, membershipPlan)
        if (body.parent_id) await loadWritablePost(user, body.parent_id, false)
      },
      execute: query =>
        executePreparedContribution<AdmittedPost>(query, async () => {
          const prepared = await preparePostWithCommunityReviews(
            user,
            getRequestContentProvenance(),
            body,
            membershipPlan,
            { query },
          )
          if (community) return prepared
          return {
            response: prepared.response.post,
            finalize: async () => (await prepared.finalize()).post,
          }
        }),
    })
    const post = 'post' in admitted ? admitted.post : admitted
    return { success: true, post: await toMcpPost(post) }
  },
}

export default tool
