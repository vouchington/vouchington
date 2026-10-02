import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  currentUserCanResolveReviewDispute,
  updateReviewDisputeDraft,
  approveReviewDispute,
  sendApprovedReviewDisputeResolution,
  resolveReviewDisputeRemove,
  resolveReviewDisputeAnnotate,
  dismissReviewDispute,
  type ReviewDisputeResolutionAction,
} from '@services/review-disputes'
import { apiResponse } from '../../response-contract.mts'
import './dispute-resolution-drafts.mts'

type UpdateDisputeDraftRequest = { public_response?: string; internal_notes?: string }
type ResolveDisputeRequest = { action: ReviewDisputeResolutionAction; body_text?: string }

// PATCH /api/v1/disputes/:id — edit dispute draft (staff only)
app.route('/api/v1/disputes/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'PATCH:/api/v1/disputes/:id',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<UpdateDisputeDraftRequest>(ctx)
  validateRequestContract(ctx, 'PATCH:/api/v1/disputes/:id', { body, path: ctx.params })

  const dispute = await updateReviewDisputeDraft(currentUser.id, id, {
    publicResponse: body.public_response,
    internalNotes: body.internal_notes,
  })

  ctx.json(apiResponse('PATCH:/api/v1/disputes/:id#staff', { dispute }))
})

// POST /api/v1/disputes/:id/approval — approve a dispute draft (staff only)
app.route('/api/v1/disputes/:id/approval').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'POST:/api/v1/disputes/:id/approval',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/disputes/:id/approval', { path: ctx.params })

  const dispute = await approveReviewDispute(currentUser.id, id)

  ctx.setStatus(200)
  ctx.json(apiResponse('POST:/api/v1/disputes/:id/approval#staff', { dispute }))
})

// POST /api/v1/disputes/:id/delivery — send approved resolution (staff only)
app.route('/api/v1/disputes/:id/delivery').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'POST:/api/v1/disputes/:id/delivery',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/disputes/:id/delivery', { path: ctx.params })

  const dispute = await sendApprovedReviewDisputeResolution(currentUser.id, id)

  ctx.setStatus(200)
  ctx.json(apiResponse('POST:/api/v1/disputes/:id/delivery#staff', { dispute }))
})

// POST /api/v1/disputes/:id/resolution — resolve a dispute (staff only)
app.route('/api/v1/disputes/:id/resolution').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'POST:/api/v1/disputes/:id/resolution',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<ResolveDisputeRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/disputes/:id/resolution', { body, path: ctx.params })
  const { action } = body

  let dispute
  if (action === 'remove') {
    dispute = await resolveReviewDisputeRemove(currentUser.id, id, 'staff_or_user')
  } else if (action === 'annotate') {
    ctx.assert(body.body_text !== undefined, 422, 'body_text is required for annotate')
    dispute = await resolveReviewDisputeAnnotate(
      currentUser.id,
      id,
      body.body_text,
      'staff_or_user',
    )
  } else {
    dispute = await dismissReviewDispute(currentUser.id, id, 'staff_or_user')
  }

  ctx.setStatus(200)
  ctx.json(apiResponse('POST:/api/v1/disputes/:id/resolution#staff', { dispute }))
})
