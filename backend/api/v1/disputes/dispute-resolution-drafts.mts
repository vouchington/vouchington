import { rerunReviewDisputeResolutionDraft } from '@services/review-disputes/rerun-resolution-draft'
import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { apiResponse } from '../../response-contract.mts'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { currentUserCanResolveReviewDispute } from '@services/review-disputes'

app.route('/api/v1/disputes/:id/resolution-drafts').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'POST:/api/v1/disputes/:id/resolution-drafts',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/disputes/:id/resolution-drafts', { path: ctx.params })

  await rerunReviewDisputeResolutionDraft(currentUser.id, id)

  ctx.setStatus(202)
  ctx.json(
    apiResponse('POST:/api/v1/disputes/:id/resolution-drafts#staff', {
      queued: true,
      rerun_by_id: currentUser.id,
    }),
  )
})
