import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  currentUserCanResolveModerationAppeal,
  updateModerationAppealDraft,
  approveModerationAppeal,
  sendApprovedModerationAppealResolution,
  rerunModerationAppealResolutionDraft,
  resolveModerationAppealAccept,
  resolveModerationAppealReduce,
  dismissModerationAppeal,
  type ModerationAppealAction,
} from '@services/moderation-appeals'
import { apiResponse } from '../../response-contract.mts'

type UpdateAppealDraftRequest = { public_response?: string; internal_notes?: string }
type ResolveAppealRequest = { action: ModerationAppealAction }

app.route('/api/v1/appeals/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationAppeal,
    'PATCH:/api/v1/appeals/:id',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<UpdateAppealDraftRequest>(ctx)
  validateRequestContract(ctx, 'PATCH:/api/v1/appeals/:id', { body, path: ctx.params })

  const appeal = await updateModerationAppealDraft(currentUser.id, id, {
    publicResponse: body.public_response,
    internalNotes: body.internal_notes,
  })

  ctx.json(apiResponse('PATCH:/api/v1/appeals/:id#staff', { appeal }))
})

// POST /api/v1/appeals/:id/approval — approve an appeal draft (staff only)
app.route('/api/v1/appeals/:id/approval').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationAppeal,
    'POST:/api/v1/appeals/:id/approval',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/appeals/:id/approval', { path: ctx.params })

  const appeal = await approveModerationAppeal(currentUser.id, id)

  ctx.setStatus(200)
  ctx.json(apiResponse('POST:/api/v1/appeals/:id/approval#staff', { appeal }))
})

// POST /api/v1/appeals/:id/delivery — send approved resolution (staff only)
app.route('/api/v1/appeals/:id/delivery').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationAppeal,
    'POST:/api/v1/appeals/:id/delivery',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/appeals/:id/delivery', { path: ctx.params })

  const appeal = await sendApprovedModerationAppealResolution(currentUser.id, id)

  ctx.setStatus(200)
  ctx.json(apiResponse('POST:/api/v1/appeals/:id/delivery#staff', { appeal }))
})

// POST /api/v1/appeals/:id/resolution — resolve an appeal (staff only)
app.route('/api/v1/appeals/:id/resolution').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationAppeal,
    'POST:/api/v1/appeals/:id/resolution',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<ResolveAppealRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/appeals/:id/resolution', { body, path: ctx.params })
  const { action } = body
  let appeal
  if (action === 'accept') {
    appeal = await resolveModerationAppealAccept(currentUser.id, id, 'staff_or_user')
  } else if (action === 'reduce') {
    appeal = await resolveModerationAppealReduce(currentUser.id, id, 'staff_or_user')
  } else {
    appeal = await dismissModerationAppeal(currentUser.id, id, 'staff_or_user')
  }
  ctx.setStatus(200)
  ctx.json(apiResponse('POST:/api/v1/appeals/:id/resolution#staff', { appeal }))
})

app.route('/api/v1/appeals/:id/resolution-drafts').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationAppeal,
    'POST:/api/v1/appeals/:id/resolution-drafts',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/appeals/:id/resolution-drafts', { path: ctx.params })

  await rerunModerationAppealResolutionDraft(currentUser.id, id)

  ctx.setStatus(202)
  ctx.json(
    apiResponse('POST:/api/v1/appeals/:id/resolution-drafts#staff', {
      queued: true,
      rerun_by_id: currentUser.id,
    }),
  )
})
