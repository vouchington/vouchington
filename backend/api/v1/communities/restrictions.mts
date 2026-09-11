import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, requireAuth, validateUUIDParam } from '../../response-helpers.mts'
import {
  activateCommunityRestrictions,
  getCommunityMember,
  getCommunityOrThrow,
  getRaidModeSuggestion,
  liftCommunityRestriction,
  searchCommunityRestrictions,
  currentUserCanModerateCommunity,
  COMMUNITY_RESTRICTION_TYPES,
  type CommunityRestrictionType,
} from '@services/communities'
import { assertNotSuspended } from '@services/users'

app
  .route('/api/v1/communities/:idOrSlug/restrictions')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/restrictions')
    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)

    ctx.assert(
      currentUserCanModerateCommunity(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined
    const [result, suggestion] = await Promise.all([
      searchCommunityRestrictions(community.id, { limit, after }),
      getRaidModeSuggestion(community.id),
    ])

    ctx.json({
      results: result.results.map(restriction => ({
        __entity_type: 'community_restriction' as const,
        id: restriction.id,
      })),
      page_info: result.page_info,
      community_restrictions: result.results.reduce<Record<string, unknown>>((acc, restriction) => {
        acc[restriction.id] = restriction
        return acc
      }, {}),
      raid_mode_suggestion: suggestion,
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/restrictions')
    assertNotSuspended(currentUser)

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const body = await parseJsonBody<{
      restriction_types?: unknown
      expires_at?: unknown
      reason?: unknown
    }>(ctx)
    ctx.assert(
      body && typeof body === 'object' && !Array.isArray(body),
      422,
      'Request body must be a JSON object',
    )
    ctx.assert(Array.isArray(body.restriction_types), 422, 'restriction_types is required')
    const restrictionTypes = body.restriction_types as CommunityRestrictionType[]
    const allowedTypes = new Set(COMMUNITY_RESTRICTION_TYPES)
    for (const restrictionType of restrictionTypes) {
      ctx.assert(
        typeof restrictionType === 'string' && allowedTypes.has(restrictionType),
        422,
        'Invalid restriction_type',
      )
    }
    ctx.assert(
      body.reason === undefined || body.reason === null || typeof body.reason === 'string',
      422,
      'reason must be a string',
    )

    let expiresAt: Date | null = null
    if (body.expires_at !== undefined && body.expires_at !== null) {
      ctx.assert(typeof body.expires_at === 'string', 422, 'expires_at must be an ISO date string')
      expiresAt = new Date(body.expires_at)
      ctx.assert(!isNaN(expiresAt.getTime()), 422, 'expires_at is not a valid date')
    }

    const restrictions = await activateCommunityRestrictions(currentUser, community.id, {
      restrictionTypes,
      expiresAt,
      reason: typeof body.reason === 'string' ? body.reason : null,
    })

    ctx.setStatus(201)
    ctx.json({
      community_restrictions: restrictions.reduce<Record<string, unknown>>((acc, restriction) => {
        acc[restriction.id] = restriction
        return acc
      }, {}),
    })
  })

app.route('/api/v1/communities/:idOrSlug/restrictions/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/restrictions/:id',
  )
  assertNotSuspended(currentUser)

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const restrictionId = validateUUIDParam(ctx, 'id')
  const community = await getCommunityOrThrow(idOrSlug)

  await liftCommunityRestriction(currentUser, community.id, restrictionId)
  ctx.setStatus(204)
})
