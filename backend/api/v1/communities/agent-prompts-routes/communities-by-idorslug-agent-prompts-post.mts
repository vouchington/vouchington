import type { Context } from '@jongleberry/api-server'
import { getCommunityMember } from '@services/communities'
import {
  createCommunityAgentPrompt,
  currentUserCanManageCommunityPrompts,
} from '@services/community-agent-prompts'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { getCommunityOrThrow } from './shared.mts'

app.route('/api/v1/communities/:idOrSlug/agent-prompts').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/agent-prompts')

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(ctx, idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanManageCommunityPrompts(currentUser, community, membership),
    403,
    'Forbidden',
  )

  const body = (await ctx.request.json('1mb')) as {
    prompt: string
    model_name?: string
    model_provider?: string
  }
  ctx.assert(typeof body.prompt === 'string' && body.prompt, 422, 'prompt is required')

  const prompt = await createCommunityAgentPrompt(currentUser.id, community.id, {
    prompt: body.prompt,
    modelName: body.model_name,
    modelProvider: body.model_provider,
  })

  ctx.setStatus(201)
  ctx.json({ community_agent_prompt: prompt })
})
