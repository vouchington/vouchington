import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { loadCommunityForModerator, getCommunityOrThrow } from '@services/communities'
import { dismissCommunityAutomodFlag } from '@services/communities/publications/automod-flag'
import { assertNotSuspended, isModerationStaff } from '@services/users'

/**
 * POST /api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal
 *
 * Dismisses the open automod review-queue flag on a post. Moderators and site staff only; 404
 * when the post has no current flag (never flagged, edited since, unpublished or deleted).
 */
app
  .route('/api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal',
    )
    assertNotSuspended(currentUser)
    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const postId = validateUUIDParam(ctx, 'postId')
    const community = isModerationStaff(currentUser)
      ? await getCommunityOrThrow(idOrSlug)
      : (await loadCommunityForModerator(currentUser, idOrSlug)).community
    validateRequestContract(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal',
      { path: ctx.params },
    )

    await dismissCommunityAutomodFlag({
      communityId: community.id,
      postId,
      dismissedById: currentUser.id,
    })
    ctx.setStatus(204)
  })
