import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { loadCommunityForModerator, getCommunityOrThrow } from '@services/communities'
import { assertNotSuspended, isModerationStaff } from '@services/users'
import {
  escalateModerationQueueItem,
  deEscalateModerationQueueItem,
} from '@services/moderation-threads'

app.route('/api/v1/communities/:idOrSlug/posts/:postId/escalation').post(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/communities/:idOrSlug/posts/:postId/escalation',
  )
  assertNotSuspended(currentUser)
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const postId = validateUUIDParam(ctx, 'postId')
  const isStaff = isModerationStaff(currentUser)
  const community = isStaff
    ? await getCommunityOrThrow(idOrSlug)
    : (await loadCommunityForModerator(currentUser, idOrSlug)).community
  validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/posts/:postId/escalation', {
    path: ctx.params,
  })

  await escalateModerationQueueItem(currentUser.id, { communityId: community.id, postId })
  ctx.setStatus(204)
})

app.route('/api/v1/communities/:idOrSlug/posts/:postId/escalation').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/posts/:postId/escalation',
  )
  assertNotSuspended(currentUser)
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const postId = validateUUIDParam(ctx, 'postId')
  const isStaff = isModerationStaff(currentUser)
  const community = isStaff
    ? await getCommunityOrThrow(idOrSlug)
    : (await loadCommunityForModerator(currentUser, idOrSlug)).community
  validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/posts/:postId/escalation', {
    path: ctx.params,
  })

  await deEscalateModerationQueueItem(currentUser.id, { communityId: community.id, postId })
  ctx.setStatus(204)
})
