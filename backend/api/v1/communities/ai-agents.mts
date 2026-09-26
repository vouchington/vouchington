import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { getCommunityMember, getCommunityOrThrow } from '@services/communities'
import {
  currentUserCanManageCommunityAiAgents,
  disableCommunityAutoTaggerAgent,
  enableCommunityAutoTaggerAgent,
  searchCommunityAutoTaggerAgents,
} from '@services/moderation'

app.route('/api/v1/communities/:idOrSlug/ai-agents').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/ai-agents')
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)
  ctx.assert(
    currentUserCanManageCommunityAiAgents(currentUser, community, membership),
    403,
    'Forbidden',
  )
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/ai-agents', {
    path: ctx.params,
  })
  const agents = await searchCommunityAutoTaggerAgents(currentUser, community.id, membership)

  ctx.json({ community_ai_agents: agents })
})

app
  .route('/api/v1/communities/:idOrSlug/ai-agents/:agentSlug')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'PUT:/api/v1/communities/:idOrSlug/ai-agents/:agentSlug',
    )
    validateRequestContract(ctx, 'PUT:/api/v1/communities/:idOrSlug/ai-agents/:agentSlug', {
      path: ctx.params,
    })
    const { idOrSlug, agentSlug } = ctx.params as { idOrSlug: string; agentSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const agent = await enableCommunityAutoTaggerAgent(currentUser, community.id, agentSlug)

    ctx.json({ community_ai_agent: agent })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/ai-agents/:agentSlug',
    )
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/ai-agents/:agentSlug', {
      path: ctx.params,
    })
    const { idOrSlug, agentSlug } = ctx.params as { idOrSlug: string; agentSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const agent = await disableCommunityAutoTaggerAgent(currentUser, community.id, agentSlug)

    ctx.json({ community_ai_agent: agent })
  })
