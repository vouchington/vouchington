import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryUuid } from '@modules/pagination'
import { getCommunityMember } from '@services/communities'
import {
  currentUserCanManageCommunityPrompts,
  listCommunityAgentPromptHistory,
} from '@services/community-agent-prompts'
import app from '../../../app.mts'
import { apiQuery } from '../../../response-contract.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { getCommunityOrThrow } from './shared.mts'

const historyQuery = defineQueryContract({ promptId: queryUuid(), before: queryUuid() })

app.route('/api/v1/communities/:idOrSlug/agent-prompts/history').get(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/agent-prompts/history',
  )
  apiQuery('GET:/api/v1/communities/:idOrSlug/agent-prompts/history', historyQuery)

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(ctx, idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanManageCommunityPrompts(currentUser, community, membership),
    403,
    'Forbidden',
  )
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/agent-prompts/history', {
    path: ctx.params,
    query: ctx.query,
  })

  const { promptId, before } = ctx.query as { promptId?: string; before?: string }

  const result = await listCommunityAgentPromptHistory(community.id, { promptId, before })
  ctx.json(result)
})
