import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getCommunity, getCommunityMember } from '@services/communities'
import { currentUserCanViewCommunityModerationResults } from '@services/community-agent-prompts'
import { getMembershipByUserId } from '@services/memberships'
import { isModerationStaff } from '@services/users'
import {
  getCommunityModerationTransparency,
  type ModerationAnalyticsRange,
} from '@services/moderation-analytics'
import { defineQueryContract, queryEnum, queryString } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { requireAuth } from '../../response-helpers.mts'

const RANGE_VALUES = ['today', '7d', '30d', '90d', 'all'] as const
const VALID_RANGES = new Set<ModerationAnalyticsRange>(RANGE_VALUES)
const rangeQuery = defineQueryContract({
  range: queryEnum(RANGE_VALUES, {
    default: '30d',
    description: 'Aggregate window; invalid or omitted values use 30d.',
  }),
  after: queryString({
    description: 'Opaque continuation cursor for an older all-time monthly page.',
  }),
})

// Aggregate-only community prompt outcomes. This intentionally does not expose a community id,
// prompt, post, member, reporter, model output, or reasoning in the response body.
app.route('/api/v1/communities/:idOrSlug/moderation-transparency').get(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/moderation-transparency',
  )
  apiQuery('GET:/api/v1/communities/:idOrSlug/moderation-transparency', rangeQuery)

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunity(idOrSlug)
  ctx.assert(community, 404, 'Community not found')
  const [membership, planMembership] = await Promise.all([
    getCommunityMember(community.id, currentUser.id),
    getMembershipByUserId(currentUser.id),
  ])
  const canView = currentUserCanViewCommunityModerationResults(
    currentUser,
    community,
    membership,
    planMembership,
  )
  if (!canView) {
    const isPrivate = community.visibility !== 'public'
    ctx.assert(
      false,
      isPrivate && !isModerationStaff(currentUser) && !membership ? 404 : 403,
      'Forbidden',
    )
  }
  const range = parseRange(ctx.query.range)
  ctx.json(
    await getCommunityModerationTransparency(
      community.id,
      range,
      new Date(),
      getAfter(ctx, ctx.query.after, range),
    ),
  )
})

function parseRange(raw: unknown): ModerationAnalyticsRange {
  return typeof raw === 'string' && VALID_RANGES.has(raw as ModerationAnalyticsRange)
    ? (raw as ModerationAnalyticsRange)
    : '30d'
}

function getAfter(ctx: Context, raw: unknown, range: ModerationAnalyticsRange): string | undefined {
  if (range !== 'all' || raw === undefined) return undefined
  ctx.assert(typeof raw === 'string', 400, 'Invalid moderation transparency cursor')
  return raw
}
