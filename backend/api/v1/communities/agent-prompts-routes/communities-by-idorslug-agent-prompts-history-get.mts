import type { Context } from '@jongleberry/api-server'
import { getCommunityMember } from '@services/communities'
import {
  currentUserCanManageCommunityPrompts,
  listCommunityAgentPromptHistory,
} from '@services/community-agent-prompts'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'
import { getCommunityOrThrow } from './shared.mts'

app.route('/api/v1/communities/:idOrSlug/agent-prompts/history').get(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/agent-prompts/history',
  )

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(ctx, idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanManageCommunityPrompts(currentUser, community, membership),
    403,
    'Forbidden',
  )

  const { promptId, before } = ctx.query as { promptId?: string; before?: string }

  const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
  if (promptId !== undefined) {
    ctx.assert(UUID_RE.test(promptId), 400, 'Invalid promptId')
  }
  if (before !== undefined) {
    ctx.assert(UUID_RE.test(before), 400, 'Invalid before cursor')
  }

  const result = await listCommunityAgentPromptHistory(community.id, { promptId, before })
  ctx.json(result)
})
