import type { Context } from '@jongleberry/api-server'
import { getCommunityMember } from '@services/communities'
import {
  currentUserCanManageCommunityPrompts,
  deleteCommunityAgentPrompt,
  getCommunityAgentPrompt,
  updateCommunityAgentPrompt,
} from '@services/community-agent-prompts'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

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
    if (body.prompt !== undefined) {
      ctx.assert(typeof body.prompt === 'string', 422, 'prompt must be a string')
    }

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

    await deleteCommunityAgentPrompt(currentUser, promptId)

    ctx.setStatus(204)
  })
