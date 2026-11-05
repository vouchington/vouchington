import type { Context } from '@jongleberry/api-server'
import { hasPlusTier } from '@modules/membership-helpers'
import { loadCommunityWithViewer } from '@services/communities'
import {
  currentUserCanManageCommunityPrompts,
  getSlotLimitForMembership,
  getUsedSlotsForUser,
  searchCommunityAgentPrompts,
  SLOT_LIMITS_BY_PLAN,
} from '@services/community-agent-prompts'
import { getMembershipByUserId } from '@services/memberships/get'
import { defineQueryContract, queryInteger, queryString } from '@vouchington/pagination'
import { apiQuery } from '../../../api-query-contract.mts'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

const agentPromptsQuery = defineQueryContract({
  after: queryString({ description: 'Opaque cursor from page_info.end_cursor.' }),
  limit: queryInteger(
    { minimum: 1, maximum: 100, default: 25 },
    { description: 'Larger values are clamped to 100; other invalid values use 25.' },
  ),
})

app.route('/api/v1/communities/:idOrSlug/agent-prompts').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/communities/:idOrSlug/agent-prompts', agentPromptsQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/agent-prompts')

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser.id)

  ctx.assert(
    currentUserCanManageCommunityPrompts(currentUser, community, membership),
    403,
    'Forbidden',
  )
  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25
  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/agent-prompts', {
    path: ctx.params,
    query: { limit, ...(after === undefined ? {} : { after }) },
  })

  const [{ results: prompts, page_info }, paidMembership, usedSlots] = await Promise.all([
    searchCommunityAgentPrompts(community.id, { limit, after }),
    getMembershipByUserId(currentUser.id),
    getUsedSlotsForUser(currentUser.id),
  ])
  const slotLimit = getSlotLimitForMembership(
    hasPlusTier(paidMembership) ? paidMembership?.plan : null,
  )

  ctx.json({
    community_agent_prompts: prompts,
    page_info,
    slot_info: {
      used: usedSlots,
      limit: slotLimit,
      remaining: Math.max(0, slotLimit - usedSlots),
      limits_by_plan: SLOT_LIMITS_BY_PLAN,
    },
  })
})
