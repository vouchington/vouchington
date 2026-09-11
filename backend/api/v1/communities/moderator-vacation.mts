import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody } from '../../response-helpers.mts'
import { getCommunityOrThrow, getCommunityMember } from '@services/communities'
import {
  setMyCommunityVacation,
  clearMyCommunityVacation,
  getMyCommunityVacationSettings,
  setSuppressCommunityDigestsWhileOnVacation,
  currentUserCanSetOwnModeratorVacation,
} from '@services/community-member-vacations'

// GET /api/v1/communities/:idOrSlug/moderator-vacation
app.route('/api/v1/communities/:idOrSlug/moderator-vacation').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/moderator-vacation')
  const { idOrSlug } = ctx.params as { idOrSlug: string }

  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanSetOwnModeratorVacation(currentUser, community, membership),
    403,
    'Forbidden',
  )

  ctx.json(await getMyCommunityVacationSettings(currentUser.id, { communityId: community.id }))
})

// PATCH /api/v1/communities/:idOrSlug/moderator-vacation
app.route('/api/v1/communities/:idOrSlug/moderator-vacation').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'PATCH:/api/v1/communities/:idOrSlug/moderator-vacation',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)
  ctx.assert(
    currentUserCanSetOwnModeratorVacation(currentUser, community, membership),
    403,
    'Forbidden',
  )
  const body = await parseJsonBody<{
    suppress_community_digests_while_on_vacation?: unknown
  }>(ctx)
  ctx.assert(
    typeof body.suppress_community_digests_while_on_vacation === 'boolean',
    422,
    'suppress_community_digests_while_on_vacation must be a boolean',
  )
  const suppress = await setSuppressCommunityDigestsWhileOnVacation(currentUser.id, {
    communityId: community.id,
    suppress: body.suppress_community_digests_while_on_vacation,
  })
  ctx.json({ suppress_community_digests_while_on_vacation: suppress })
})

// PUT /api/v1/communities/:idOrSlug/moderator-vacation
app.route('/api/v1/communities/:idOrSlug/moderator-vacation').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/communities/:idOrSlug/moderator-vacation')
  const { idOrSlug } = ctx.params as { idOrSlug: string }

  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanSetOwnModeratorVacation(currentUser, community, membership),
    403,
    'Forbidden',
  )

  const body = await parseJsonBody<{ ends_at?: string | null }>(ctx)
  const endsAt = body.ends_at ?? null

  if (endsAt != null) {
    ctx.assert(typeof endsAt === 'string', 422, 'ends_at must be a string')
    ctx.assert(!isNaN(Date.parse(endsAt)), 422, 'ends_at must be a valid date string')
    ctx.assert(new Date(endsAt) > new Date(), 422, 'ends_at must be in the future')
  }

  await setMyCommunityVacation(currentUser.id, {
    communityId: community.id,
    endsAt,
  })
  ctx.json(await getMyCommunityVacationSettings(currentUser.id, { communityId: community.id }))
})

// DELETE /api/v1/communities/:idOrSlug/moderator-vacation
app.route('/api/v1/communities/:idOrSlug/moderator-vacation').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/moderator-vacation',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }

  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(
    currentUserCanSetOwnModeratorVacation(currentUser, community, membership),
    403,
    'Forbidden',
  )

  await clearMyCommunityVacation(currentUser.id, { communityId: community.id })
  ctx.setStatus(204)
})
