import {
  disputeAnnotationsMaxValues,
  getDisputeAnnotationPostLimit,
} from '@services/review-disputes/annotation-limits'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuth,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import type { ApiArrayContract } from '@vouchington/utils/api-response-contract'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import {
  getActiveAnnotationForPost,
  getActiveAnnotationsForPosts,
  listDisputesForPost,
  removeReviewDisputeAnnotation,
  currentUserCanResolveReviewDispute,
} from '@services/review-disputes'
import { isModerationStaff } from '@services/users'

type BatchDisputeAnnotationsRequest = {
  post_ids: ApiArrayContract<
    ApiUuidContract,
    0,
    typeof disputeAnnotationsMaxValues.max_batch_post_ids,
    false
  >
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
  const body = (await parseJsonBody(ctx, '100kb')) as BatchDisputeAnnotationsRequest
  validateRequestContract(ctx, 'POST:/api/v1/posts/batch-dispute-annotations', { body })
  const limit = getDisputeAnnotationPostLimit()
  ctx.assert(body.post_ids.length <= limit, 422, `Too many post IDs (max ${limit})`)
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
  const body = (await parseJsonBody(ctx, '10kb')) as RemoveDisputeAnnotationRequest
  validateRequestContract(ctx, 'DELETE:/api/v1/disputes/:id/annotation', {
    body,
    path: ctx.params,
  })
  await removeReviewDisputeAnnotation(currentUser.id, body.annotation_id)
  ctx.setStatus(204)
})
