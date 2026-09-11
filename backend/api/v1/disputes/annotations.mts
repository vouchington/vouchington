import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import {
  getActiveAnnotationForPost,
  getActiveAnnotationsForPosts,
  listDisputesForPost,
  removeReviewDisputeAnnotation,
  currentUserCanResolveReviewDispute,
} from '@services/review-disputes'
import { isModerationStaff } from '@services/users'

// GET /api/v1/posts/:postId/dispute-annotation — public endpoint for review detail
app.route('/api/v1/posts/:postId/dispute-annotation').get(async (ctx: Context) => {
  const postId = validateUUIDParam(ctx, 'postId')
  const annotation = await getActiveAnnotationForPost(postId)
  ctx.json({ annotation: annotation ?? null })
})

// GET /api/v1/posts/:postId/disputes — list disputes for a post (staff only)
app.route('/api/v1/posts/:postId/disputes').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/posts/:postId/disputes')
  const postId = validateUUIDParam(ctx, 'postId')
  ctx.assert(isModerationStaff(currentUser), 403, 'Forbidden')
  const disputes = await listDisputesForPost(postId)
  ctx.json({ disputes })
})

// GET /api/v1/posts/batch-dispute-annotations — batch annotation lookup for post lists
app.route('/api/v1/posts/batch-dispute-annotations').post(async (ctx: Context) => {
  await requireAuth(ctx, 'POST:/api/v1/posts/batch-dispute-annotations')
  const body = (await ctx.request.json('100kb')) as { post_ids?: unknown }
  ctx.assert(Array.isArray(body.post_ids), 422, 'post_ids must be an array')
  const postIds = body.post_ids as string[]
  ctx.assert(postIds.length <= 50, 422, 'Maximum 50 post IDs per request')
  const annotations = await getActiveAnnotationsForPosts(postIds)
  ctx.json({ annotations })
})

// DELETE /api/v1/disputes/:id/annotation — retract annotation (staff only)
app.route('/api/v1/disputes/:id/annotation').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'DELETE:/api/v1/disputes/:id/annotation',
  )
  validateUUIDParam(ctx, 'id')
  const body = (await ctx.request.json('10kb')) as { annotation_id?: unknown }
  ctx.assert(typeof body.annotation_id === 'string', 422, 'annotation_id is required')
  await removeReviewDisputeAnnotation(currentUser.id, body.annotation_id)
  ctx.setStatus(204)
})
