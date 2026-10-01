import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuth,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import type { ApiArrayContract } from '../../response-contract.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import {
  getActiveAnnotationForPost,
  getActiveAnnotationsForPosts,
  listDisputesForPost,
  removeReviewDisputeAnnotation,
  currentUserCanResolveReviewDispute,
} from '@services/review-disputes'
import { isModerationStaff } from '@services/users'

const MAX_BATCH_ANNOTATION_POST_IDS = 50

type BatchDisputeAnnotationsRequest = {
  post_ids: ApiArrayContract<ApiUuidContract, 0, typeof MAX_BATCH_ANNOTATION_POST_IDS, false>
}
type RemoveDisputeAnnotationRequest = { annotation_id: ApiUuidContract }

// GET /api/v1/posts/:postId/dispute-annotation — public endpoint for review detail
app.route('/api/v1/posts/:postId/dispute-annotation').get(async (ctx: Context) => {
  const postId = validateUUIDParam(ctx, 'postId')
  validateRequestContract(ctx, 'GET:/api/v1/posts/:postId/dispute-annotation', {
    path: ctx.params,
  })
  const annotation = await getActiveAnnotationForPost(postId)
  ctx.json({ annotation: annotation ?? null })
})

// GET /api/v1/posts/:postId/disputes — list disputes for a post (staff only)
app.route('/api/v1/posts/:postId/disputes').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/posts/:postId/disputes')
  ctx.assert(isModerationStaff(currentUser), 403, 'Forbidden')
  const postId = validateUUIDParam(ctx, 'postId')
  validateRequestContract(ctx, 'GET:/api/v1/posts/:postId/disputes', { path: ctx.params })
  const disputes = await listDisputesForPost(postId)
  ctx.json({ disputes })
})

// GET /api/v1/posts/batch-dispute-annotations — batch annotation lookup for post lists
app.route('/api/v1/posts/batch-dispute-annotations').post(async (ctx: Context) => {
  await requireAuth(ctx, 'POST:/api/v1/posts/batch-dispute-annotations')
  const body = (await ctx.request.json('100kb')) as BatchDisputeAnnotationsRequest
  validateRequestContract(ctx, 'POST:/api/v1/posts/batch-dispute-annotations', { body })
  const annotations = await getActiveAnnotationsForPosts(body.post_ids)
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
  const body = (await ctx.request.json('10kb')) as RemoveDisputeAnnotationRequest
  validateRequestContract(ctx, 'DELETE:/api/v1/disputes/:id/annotation', {
    body,
    path: ctx.params,
  })
  await removeReviewDisputeAnnotation(currentUser.id, body.annotation_id)
  ctx.setStatus(204)
})
