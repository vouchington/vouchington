import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getCommunityOrThrow, getCommunityMember } from '@services/communities'
import {
  searchModeratorActions,
  currentUserCanViewCommunityModlog,
  MODERATOR_ACTION_TYPES,
} from '@services/moderator-actions'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { isModerationStaff } from '@services/users'
import { createPaginationParser } from '@modules/pagination'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/communities/:idOrSlug/modlog
app.route('/api/v1/communities/:idOrSlug/modlog').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/modlog')
  const { idOrSlug } = ctx.params as { idOrSlug: string }

  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  const canViewModlog = currentUserCanViewCommunityModlog(currentUser, community, membership)
  if (!canViewModlog) {
    // Return 404 for private communities to non-staff/non-members (information hiding).
    // A non-member should not be able to distinguish a valid private community from a missing one.
    const isPrivate = community.visibility !== 'public'
    ctx.assert(
      false,
      isPrivate && !isModerationStaff(currentUser) && !membership ? 404 : 403,
      'Forbidden',
    )
  }

  const { limit, after } = parser.parse(ctx.query)
  const rawActionType = ctx.query.action_type as string | undefined
  const actionType = MODERATOR_ACTION_TYPES.includes(rawActionType as never)
    ? (rawActionType as (typeof MODERATOR_ACTION_TYPES)[number])
    : undefined

  const result = await searchModeratorActions({
    communityId: community.id,
    limit,
    after,
    actionType,
  })

  const actorIds: string[] = []
  for (const r of result.results) {
    if (r.actor_id !== null) actorIds.push(r.actor_id)
  }
  const actors = await getUserPublicByAnyCachedBatch(actorIds).then(us =>
    us.reduce<Record<string, unknown>>((acc, u) => {
      if (u) acc[u.id] = u
      return acc
    }, {}),
  )

  // Community-scoped viewers who are not mod staff must not see target_user_id on warn actions:
  // warn actions can originate from reports on anonymous posts, and the UUID would deanonymize
  // the author. Mod staff can see all fields.
  const isStaff = isModerationStaff(currentUser)
  ctx.json({
    results: result.results.map(r => ({
      __entity_type: 'moderator_action' as const,
      id: r.id,
    })),
    page_info: result.page_info,
    moderator_actions: result.results.reduce<Record<string, unknown>>((acc, r) => {
      const row = !isStaff && r.action_type === 'warn' ? { ...r, target_user_id: null } : r
      acc[r.id] = row
      return acc
    }, {}),
    users: actors,
  })
})
