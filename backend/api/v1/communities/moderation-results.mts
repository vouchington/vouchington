import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getCommunity, getCommunityMember } from '@services/communities'
import { getMembershipByUserId } from '@services/memberships/get'
import {
  currentUserCanViewCommunityModerationResults,
  currentUserIsCommunityModerator,
} from '@services/community-agent-prompts'
import {
  searchCommunityAgentModerations,
  type CommunityAgentModerationResult,
} from '@services/community-agent-prompts/moderations'
import { getPostByAny } from '@services/posts/get'
import { getCommunityPostReview } from '@services/communities/publications/get'
import { getStoredPostOpenAIModeration } from '@services/openai-moderation'

type ModerationResultsResponse = {
  community_agent_moderations: CommunityAgentModerationResult[]
  openai_moderation: {
    flagged: boolean | null
    results: Record<string, unknown> | Array<Record<string, unknown>> | null
  }
}

// GET /api/v1/communities/:idOrSlug/posts/:postId/moderation-results
app
  .route('/api/v1/communities/:idOrSlug/posts/:postId/moderation-results')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/posts/:postId/moderation-results',
    )

    const { idOrSlug, postId } = ctx.params as { idOrSlug: string; postId: string }
    const community = await getCommunity(idOrSlug)
    ctx.assert(community, 404, 'Community not found')

    const [membership, activeMembership] = await Promise.all([
      getCommunityMember(community.id, currentUser.id),
      getMembershipByUserId(currentUser.id),
    ])

    ctx.assert(
      currentUserCanViewCommunityModerationResults(
        currentUser,
        community,
        membership,
        activeMembership,
      ),
      403,
      'Forbidden',
    )

    const post = await getPostByAny(postId)
    ctx.assert(post, 404, 'Post not found')

    const isModerator = currentUserIsCommunityModerator(currentUser, community, membership)

    const [moderations, review] = await Promise.all([
      searchCommunityAgentModerations(post.id, community.id),
      getCommunityPostReview(community.id, post.id),
    ])

    // Moderators can see results for any post (including pending).
    // Plus+ members can only see results for approved, visible posts.
    const isVisible = isModerator ? !!review : !!review?.approved_at && !review?.unpublished_at
    ctx.assert(isVisible, 404, 'Post not found in this community')

    const openaiModeration = await getStoredPostOpenAIModeration(post.id)
    ctx.assert(openaiModeration, 404, 'Post not found')

    const responseBody: ModerationResultsResponse = {
      community_agent_moderations: moderations,
      openai_moderation: openaiModeration,
    }
    ctx.json(responseBody)
  })
