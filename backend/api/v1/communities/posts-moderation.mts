import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  approvePublication,
  loadCommunityForPublicationModerator,
  overridePublication,
  rejectPublication,
  unpublishPost,
} from '@services/communities'
import { isModerationStaff } from '@services/users'

app.route('/api/v1/communities/:idOrSlug/posts/:postId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/communities/:idOrSlug/posts/:postId')
  const { idOrSlug, postId } = ctx.params as { idOrSlug: string; postId: string }
  const { community } = await loadCommunityForPublicationModerator(currentUser, idOrSlug)
  const body = (await ctx.request.json('1mb')) as {
    status?: unknown
    reason?: unknown
    reason_code?: unknown
    private_note?: unknown
  }
  validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/posts/:postId', {
    path: ctx.params,
    body,
  })
  ctx.assert(typeof body.status === 'string', 422, 'status must be a string')
  ctx.assert(
    body.reason === undefined || typeof body.reason === 'string',
    422,
    'reason must be a string',
  )
  ctx.assert(
    body.reason_code === undefined || typeof body.reason_code === 'string',
    422,
    'reason_code must be a string',
  )
  ctx.assert(
    body.private_note === undefined || typeof body.private_note === 'string',
    422,
    'private_note must be a string',
  )

  if (isModerationStaff(currentUser)) {
    const action = statusToPlatformAction(body.status)
    ctx.assert(action, 422, 'Invalid platform publication status')
    ctx.assert(body.reason_code, 422, 'reason_code is required for platform overrides')
    await overridePublication(currentUser, community.id, postId, {
      action,
      reasonCode: body.reason_code,
      privateNote: body.private_note,
    })
  } else if (body.status === 'approved') {
    await approvePublication(currentUser, community.id, postId)
  } else if (body.status === 'rejected') {
    await rejectPublication(currentUser, community.id, postId, body.reason)
  } else if (body.status === 'unpublished') {
    await unpublishPost(currentUser, community.id, postId)
  } else {
    ctx.throw(422, "Invalid status; must be one of 'approved', 'rejected', or 'unpublished'")
  }
  ctx.setStatus(204)
})

function statusToPlatformAction(status: string) {
  if (status === 'approved') return 'approve' as const
  if (status === 'rejected') return 'reject' as const
  if (status === 'unpublished') return 'unpublish' as const
  if (status === 'restored') return 'restore' as const
  return null
}
