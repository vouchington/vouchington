import type { Context } from '@jongleberry/api-server'
import { getCommunityMember } from '@services/communities'
import {
  currentUserCanManageCommunityPrompts,
  deleteCommunityAgentPrompt,
  getCommunityAgentPrompt,
  updateCommunityAgentPrompt,
} from '@services/community-agent-prompts'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

import { getCommunityOrThrow } from './shared.mts'

app
  .route('/api/v1/communities/:idOrSlug/agent-prompts/:promptId')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/agent-prompts/:promptId',
    )

    const { idOrSlug, promptId } = ctx.params as { idOrSlug: string; promptId: string }
    const community = await getCommunityOrThrow(ctx, idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)

    ctx.assert(
      currentUserCanManageCommunityPrompts(currentUser, community, membership),
      403,
      'Forbidden',
    )
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/agent-prompts/:promptId', {
      path: ctx.params,
    })

    const prompt = await getCommunityAgentPrompt(promptId)
    ctx.assert(prompt, 404, 'Prompt not found')
    ctx.assert(prompt.community_id === community.id, 404, 'Prompt not found')

    ctx.json({ community_agent_prompt: prompt })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'PATCH:/api/v1/communities/:idOrSlug/agent-prompts/:promptId',
    )

    const { idOrSlug, promptId } = ctx.params as { idOrSlug: string; promptId: string }
    const community = await getCommunityOrThrow(ctx, idOrSlug)

    const prompt = await getCommunityAgentPrompt(promptId)
    ctx.assert(prompt, 404, 'Prompt not found')
    ctx.assert(prompt.community_id === community.id, 404, 'Prompt not found')

    const body = (await ctx.request.json('1mb')) as { prompt?: string }
    validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/agent-prompts/:promptId', {
      path: ctx.params,
      body,
    })

    const updated = await updateCommunityAgentPrompt(currentUser, promptId, {
      prompt: body.prompt,
    })

    ctx.json({ community_agent_prompt: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/agent-prompts/:promptId',
    )

    const { idOrSlug, promptId } = ctx.params as { idOrSlug: string; promptId: string }
    const community = await getCommunityOrThrow(ctx, idOrSlug)

    const prompt = await getCommunityAgentPrompt(promptId)
    ctx.assert(prompt, 404, 'Prompt not found')
    ctx.assert(prompt.community_id === community.id, 404, 'Prompt not found')
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/agent-prompts/:promptId', {
      path: ctx.params,
    })

    await deleteCommunityAgentPrompt(currentUser, promptId)

    ctx.setStatus(204)
  })
