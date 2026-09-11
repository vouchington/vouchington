import type { Context } from '@jongleberry/api-server'
import { hasPlusTier } from '@modules/membership-helpers'
import { getCommunityMember } from '@services/communities'
import {
  currentUserCanManageCommunityPrompts,
  getSlotLimitForMembership,
  getUsedSlotsForUser,
  searchCommunityAgentPrompts,
  SLOT_LIMITS_BY_PLAN,
} from '@services/community-agent-prompts'
import { getMembershipByUserId } from '@services/memberships/get'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { getCommunityOrThrow } from './shared.mts'

app.route('/api/v1/communities/:idOrSlug/agent-prompts').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/agent-prompts')

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(ctx, idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanManageCommunityPrompts(currentUser, community, membership),
    403,
    'Forbidden',
  )

  const [prompts, paidMembership, usedSlots] = await Promise.all([
    searchCommunityAgentPrompts(community.id),
    getMembershipByUserId(currentUser.id),
    getUsedSlotsForUser(currentUser.id),
  ])
  const slotLimit = getSlotLimitForMembership(
    hasPlusTier(paidMembership) ? paidMembership?.plan : null,
  )

  ctx.json({
    community_agent_prompts: prompts,
    slot_info: {
      used: usedSlots,
      limit: slotLimit,
      remaining: Math.max(0, slotLimit - usedSlots),
      limits_by_plan: SLOT_LIMITS_BY_PLAN,
    },
  })
})
