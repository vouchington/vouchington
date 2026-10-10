import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { loadCommunityWithViewer } from '@services/communities'
import {
  currentUserCanManageCommunityAiAgents,
  disableCommunityAutoTaggerAgent,
  enableCommunityAutoTaggerAgent,
  searchCommunityAutoTaggerAgents,
} from '@services/moderation'

app.route('/api/v1/communities/:idOrSlug/ai-agents').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/ai-agents')
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser.id)
  ctx.assert(
    currentUserCanManageCommunityAiAgents(currentUser, community, membership),
    403,
    'Forbidden',
  )
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/ai-agents', {
    path: ctx.params,
  })
  const agents = await searchCommunityAutoTaggerAgents(currentUser, { community, membership })

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
    const loaded = await loadCommunityWithViewer(idOrSlug, currentUser.id)
    const agent = await enableCommunityAutoTaggerAgent(currentUser, loaded, agentSlug)

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
    const loaded = await loadCommunityWithViewer(idOrSlug, currentUser.id)
    const agent = await disableCommunityAutoTaggerAgent(currentUser, loaded, agentSlug)

    ctx.json({ community_ai_agent: agent })
  })
