import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  setAnonymousPublicCacheHeaders,
} from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  loadCommunityForViewerOrApplicant,
  updateCommunity,
  deleteCommunity,
  setCommunityArchiveState,
  updateCommunityAndSetArchiveState,
  getCommunityMember,
  getCommunityMetrics,
  currentUserCanUpdateCommunity,
  currentUserCanDeleteCommunity,
  type UpdateCommunityInput,
} from '@services/communities'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

app
  .route('/api/v1/communities/:idOrSlug')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/communities/:idOrSlug')
    const { idOrSlug } = ctx.params as { idOrSlug: string }

    const { community, membership, hasPendingApplication } =
      await loadCommunityForViewerOrApplicant(currentUser, idOrSlug)

    setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

    const { owner, ...communityData } = community

    ctx.setType('json')
    await ctx.pipeline(
      streamJsonObject({
        community: communityData,
        user: owner,
        membership,
        community_metrics: getCommunityMetrics(community.id),
        ...(currentUser ? { has_pending_application: hasPendingApplication } : {}),
      }),
    )
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/communities/:idOrSlug')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const membership = await getCommunityMember(community.id, currentUser.id)

    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    const { archive, ...updateBody } = body
    if (archive !== undefined && typeof archive !== 'boolean') {
      ctx.throw(422, 'archive must be a boolean')
    }
    if (archive !== undefined) {
      ctx.assert(
        currentUserCanDeleteCommunity(currentUser, community, membership),
        403,
        'Forbidden',
      )
    }
    const input: UpdateCommunityInput = { ...updateBody }
    if ('member_invites_allowed_at' in body)
      input.member_invites_allowed_at = body.member_invites_allowed_at
        ? (community.member_invites_allowed_at ?? new Date())
        : null
    if ('post_approval_required_at' in body)
      input.post_approval_required_at = body.post_approval_required_at
        ? (community.post_approval_required_at ?? new Date())
        : null
    if ('list_type' in updateBody) {
      const lt = updateBody.list_type
      if (lt !== null && lt !== 'follow' && lt !== 'mute') {
        ctx.throw(422, 'list_type must be "follow", "mute", or null')
      }
      input.list_type = lt as 'follow' | 'mute' | null
    }
    if ('member_roster_visibility' in updateBody) {
      const value = updateBody.member_roster_visibility
      if (
        value !== 'public' &&
        value !== 'users' &&
        value !== 'members' &&
        value !== 'moderators'
      ) {
        ctx.throw(422, 'member_roster_visibility must be public, users, members, or moderators')
      }
      input.member_roster_visibility = value
    }
    const hasUpdateFields = Object.keys(updateBody).length > 0 || Object.keys(input).length > 0

    if (community.archived_at) {
      if (archive === true) {
        ctx.throw(409, 'Community is already archived')
      }
      ctx.assert(
        archive === false && !hasUpdateFields,
        409,
        'Archived communities cannot be updated',
      )
    }

    let updated = community
    if (archive !== undefined && hasUpdateFields) {
      ctx.assert(
        currentUserCanUpdateCommunity(currentUser, community, membership),
        403,
        'Forbidden',
      )
      updated = await updateCommunityAndSetArchiveState(
        currentUser,
        community.id,
        input,
        archive,
        membership,
      )
    } else if (archive === undefined) {
      ctx.assert(
        currentUserCanUpdateCommunity(currentUser, community, membership),
        403,
        'Forbidden',
      )
      updated = await updateCommunity(currentUser, community.id, input, membership)
    } else {
      updated = await setCommunityArchiveState(
        currentUser,
        community.id,
        archive,
        membership,
        community,
      )
    }
    const { owner: _owner, ...communityData } = updated

    ctx.json({ community: communityData })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/communities/:idOrSlug')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const membership = await getCommunityMember(community.id, currentUser.id)
    ctx.assert(currentUserCanDeleteCommunity(currentUser, community, membership), 403, 'Forbidden')

    await deleteCommunity(currentUser, community.id, membership)

    ctx.setStatus(204)
  })
