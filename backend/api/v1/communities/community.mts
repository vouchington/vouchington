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

    const parsedBody: unknown = await ctx.request.json('1mb')
    const isObjectBody =
      parsedBody !== null && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
    const body = isObjectBody ? (parsedBody as Record<string, unknown>) : {}
    const { archive, ...updateBody } = body
    const hasUpdateFields = Object.keys(updateBody).length > 0

    if (archive !== undefined) {
      ctx.assert(
        currentUserCanDeleteCommunity(currentUser, community, membership),
        403,
        'Forbidden',
      )
    }
    if (archive === undefined || hasUpdateFields) {
      ctx.assert(
        currentUserCanUpdateCommunity(currentUser, community, membership),
        403,
        'Forbidden',
      )
    }
    validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug', {
      path: ctx.params,
      body: parsedBody,
    })

    const input: UpdateCommunityInput = { ...updateBody }
    if ('member_invites_allowed_at' in body)
      input.member_invites_allowed_at = body.member_invites_allowed_at
        ? (community.member_invites_allowed_at ?? new Date())
        : null
    if ('post_approval_required_at' in body)
      input.post_approval_required_at = body.post_approval_required_at
        ? (community.post_approval_required_at ?? new Date())
        : null
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
      updated = await updateCommunityAndSetArchiveState(
        currentUser,
        community.id,
        input,
        archive as boolean,
        membership,
      )
    } else if (archive === undefined) {
      updated = await updateCommunity(currentUser, community.id, input, membership)
    } else {
      updated = await setCommunityArchiveState(
        currentUser,
        community.id,
        archive as boolean,
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
