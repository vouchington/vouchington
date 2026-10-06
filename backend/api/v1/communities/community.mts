import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  setAnonymousPublicCacheHeaders,
  validateRequestContract,
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
import {
  attachCommunityProvenance,
  attachWrittenCommunityProvenance,
} from '@services/content-provenance'

app
  .route('/api/v1/communities/:idOrSlug')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/communities/:idOrSlug')
    validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug', { path: ctx.params })
    const { idOrSlug } = ctx.params as { idOrSlug: string }

    const { community, membership, hasPendingApplication } =
      await loadCommunityForViewerOrApplicant(currentUser, idOrSlug)

    setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

    const { owner, ...communityData } = community
    const [labelledCommunity] = await attachCommunityProvenance([communityData], currentUser)

    ctx.setType('json')
    await ctx.pipeline(
      streamJsonObject({
        community: labelledCommunity,
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

    const rawBody = (await ctx.request.json('1mb')) as Record<string, unknown>
    const parsedBody: unknown = rawBody
    if (parsedBody === null || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      ctx.assert(
        currentUserCanUpdateCommunity(currentUser, community, membership),
        403,
        'Forbidden',
      )
      validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug', {
        path: ctx.params,
        body: parsedBody,
      })
      ctx.throw(422, 'Invalid request body')
    }
    const body = rawBody
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
      validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug', {
        path: ctx.params,
        body,
      })
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
      validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug', {
        path: ctx.params,
        body,
      })
      updated = await updateCommunity(currentUser, community.id, input, membership)
    } else {
      validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug', {
        path: ctx.params,
        body,
      })
      updated = await setCommunityArchiveState(
        currentUser,
        community.id,
        archive,
        membership,
        community,
      )
    }
    const { owner: _owner, ...communityData } = updated

    ctx.json({ community: await attachWrittenCommunityProvenance(communityData, currentUser) })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/communities/:idOrSlug')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const membership = await getCommunityMember(community.id, currentUser.id)
    ctx.assert(currentUserCanDeleteCommunity(currentUser, community, membership), 403, 'Forbidden')
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug', { path: ctx.params })

    await deleteCommunity(currentUser, community.id, membership)

    ctx.setStatus(204)
  })
