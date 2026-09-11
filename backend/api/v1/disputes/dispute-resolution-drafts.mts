import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { apiResponse } from '../../response-contract.mts'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import {
  currentUserCanResolveReviewDispute,
  getReviewDisputeByIdFromPrimary,
} from '@services/review-disputes'

app.route('/api/v1/disputes/:id/resolution-drafts').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'POST:/api/v1/disputes/:id/resolution-drafts',
  )
  const id = validateUUIDParam(ctx, 'id')

  const dispute = await getReviewDisputeByIdFromPrimary(id)
  ctx.assert(dispute, 404, 'Dispute not found')
  ctx.assert(
    dispute.approved_at == null && dispute.sent_at == null && dispute.resolved_at == null,
    422,
    'Only unapproved pending disputes can be rerun',
  )
  const { enqueueDisputeResolutionAndWait } =
    await import('@queues/ai-agents/enqueues/dispute-resolution')
  await enqueueDisputeResolutionAndWait(id, currentUser.id)

  ctx.setStatus(202)
  ctx.json(
    apiResponse('POST:/api/v1/disputes/:id/resolution-drafts#staff', {
      queued: true,
      rerun_by_id: currentUser.id,
    }),
  )
})
