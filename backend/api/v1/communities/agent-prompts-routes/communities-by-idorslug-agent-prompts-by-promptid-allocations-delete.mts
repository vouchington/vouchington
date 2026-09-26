import type { Context } from '@jongleberry/api-server'
import { currentUserCanModerateCommunity, getCommunityMember } from '@services/communities'
import {
  deallocateCommunityAgentPromptSlot,
  getCommunityAgentPrompt,
} from '@services/community-agent-prompts'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

import { getCommunityOrThrow } from './shared.mts'

app
  .route('/api/v1/communities/:idOrSlug/agent-prompts/:promptId/allocations')
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/agent-prompts/:promptId/allocations',
    )

    const { idOrSlug, promptId } = ctx.params as { idOrSlug: string; promptId: string }
    const community = await getCommunityOrThrow(ctx, idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)

    ctx.assert(
      currentUserCanModerateCommunity(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const prompt = await getCommunityAgentPrompt(promptId)
    ctx.assert(prompt, 404, 'Prompt not found')
    ctx.assert(prompt.community_id === community.id, 404, 'Prompt not found')
    ctx.assert(prompt.created_by_id === currentUser.id, 403, 'Forbidden')
    validateRequestContract(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/agent-prompts/:promptId/allocations',
      { path: ctx.params },
    )

    await deallocateCommunityAgentPromptSlot(currentUser.id, promptId)

    ctx.setStatus(204)
  })
