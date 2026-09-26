import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getCommunityOrThrow, getCommunityMember } from '@services/communities'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { getModerationAnalytics } from '@services/moderation-analytics'
import type { ModerationAnalyticsRange } from '@services/moderation-analytics/types'
import { currentUserCanViewCommunityModlog } from '@services/moderator-actions'
import { isModerationStaff } from '@services/users'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'

const VALID_RANGES = new Set<ModerationAnalyticsRange>(['today', '7d', '30d', '90d', 'all'])

function parseRange(raw: unknown): ModerationAnalyticsRange {
  if (typeof raw === 'string' && VALID_RANGES.has(raw as ModerationAnalyticsRange)) {
    return raw as ModerationAnalyticsRange
  }
  return '30d'
}

app.route('/api/v1/communities/:idOrSlug/moderation-analytics').get(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/moderation-analytics',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }

  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  const canView = currentUserCanViewCommunityModlog(currentUser, community, membership)
  if (!canView) {
    const isPrivate = community.visibility !== 'public'
    ctx.assert(
      false,
      isPrivate && !isModerationStaff(currentUser) && !membership ? 404 : 403,
      'Forbidden',
    )
  }

  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/moderation-analytics', {
    path: ctx.params,
  })

  const range = parseRange(ctx.query.range)
  const metrics = await getModerationAnalytics(range, {
    type: 'community',
    communityId: community.id,
  })

  metrics.moderator_workload.users = await getModeratorUsers(
    metrics.moderator_workload.moderators.map(m => m.actor_id),
  )

  ctx.json(metrics)
})

function getModeratorUsers(actorIds: string[]): Promise<Record<string, unknown>> {
  if (actorIds.length === 0) return Promise.resolve({})

  return getUserPublicByAnyCachedBatch(actorIds).then(users =>
    users.reduce<Record<string, unknown>>((acc, user) => {
      if (user) acc[user.id] = user
      return acc
    }, {}),
  )
}
