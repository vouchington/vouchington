import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getCommunityOrThrow, getCommunityMember } from '@services/communities'
import {
  aggregateModeratorActionCounts,
  currentUserCanViewCommunityModlog,
} from '@services/moderator-actions'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { isModerationStaff } from '@services/users'

const VALID_WINDOWS = [30, 90] as const
type WindowDays = (typeof VALID_WINDOWS)[number]

// GET /api/v1/communities/:idOrSlug/moderator-stats?window=30|90
app.route('/api/v1/communities/:idOrSlug/moderator-stats').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/moderator-stats')
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

  const rawWindow = ctx.query.window
  const windowDays: WindowDays = rawWindow === '90' ? 90 : 30

  const stats = await aggregateModeratorActionCounts({
    communityId: community.id,
    windowDays,
  })

  const actorIds = stats.map(s => s.actor_id)
  const users =
    actorIds.length === 0
      ? {}
      : await getUserPublicByAnyCachedBatch(actorIds).then(us =>
          us.reduce<Record<string, unknown>>((acc, u) => {
            if (u) acc[u.id] = u
            return acc
          }, {}),
        )

  ctx.json({
    window: windowDays,
    stats,
    users,
  })
})
