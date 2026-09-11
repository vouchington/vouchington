import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam } from '../../response-helpers.mts'
import { loadCommunityForModerator, getCommunityOrThrow } from '@services/communities'
import { isModerationStaff } from '@services/users'
import { claimModerationQueueItem, releaseModerationQueueItem } from '@services/moderation-claims'

app.route('/api/v1/communities/:idOrSlug/posts/:postId/claim').put(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'PUT:/api/v1/communities/:idOrSlug/posts/:postId/claim',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const postId = validateUUIDParam(ctx, 'postId')
  const isStaff = isModerationStaff(currentUser)
  const community = isStaff
    ? await getCommunityOrThrow(idOrSlug)
    : (await loadCommunityForModerator(currentUser, idOrSlug)).community

  const result = await claimModerationQueueItem(currentUser.id, {
    communityId: community.id,
    postId,
  })

  ctx.json({ claim: result.claim, claimed_by_other: result.claimed_by_other })
})

app.route('/api/v1/communities/:idOrSlug/posts/:postId/claim').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/posts/:postId/claim',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const postId = validateUUIDParam(ctx, 'postId')
  const isStaff = isModerationStaff(currentUser)
  const community = isStaff
    ? await getCommunityOrThrow(idOrSlug)
    : (await loadCommunityForModerator(currentUser, idOrSlug)).community

  await releaseModerationQueueItem(currentUser.id, { communityId: community.id, postId })
  ctx.setStatus(204)
})
