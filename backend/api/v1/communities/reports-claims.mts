import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { loadCommunityForModerator, getCommunityOrThrow } from '@services/communities'
import { isModerationStaff } from '@services/users'
import { claimModerationQueueItem, releaseModerationQueueItem } from '@services/moderation-claims'

app.route('/api/v1/communities/:idOrSlug/reports/:reportId/claim').put(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'PUT:/api/v1/communities/:idOrSlug/reports/:reportId/claim',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const reportId = validateUUIDParam(ctx, 'reportId')
  const isStaff = isModerationStaff(currentUser)
  const community = isStaff
    ? await getCommunityOrThrow(idOrSlug)
    : (await loadCommunityForModerator(currentUser, idOrSlug)).community
  validateRequestContract(ctx, 'PUT:/api/v1/communities/:idOrSlug/reports/:reportId/claim', {
    path: ctx.params,
  })

  const result = await claimModerationQueueItem(currentUser.id, {
    communityId: community.id,
    reportId,
  })

  ctx.json({ claim: result.claim, claimed_by_other: result.claimed_by_other })
})

app.route('/api/v1/communities/:idOrSlug/reports/:reportId/claim').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/reports/:reportId/claim',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const reportId = validateUUIDParam(ctx, 'reportId')
  const isStaff = isModerationStaff(currentUser)
  const community = isStaff
    ? await getCommunityOrThrow(idOrSlug)
    : (await loadCommunityForModerator(currentUser, idOrSlug)).community
  validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/reports/:reportId/claim', {
    path: ctx.params,
  })

  await releaseModerationQueueItem(currentUser.id, { communityId: community.id, reportId })
  ctx.setStatus(204)
})
