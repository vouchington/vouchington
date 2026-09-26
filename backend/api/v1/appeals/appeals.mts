import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuth,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  getModerationAppealById,
  getModerationAppealByIdFromPrimary,
  listModerationAppeals,
  redactModerationAppeal,
  listRedactedModerationAppeals,
  currentUserCanResolveModerationAppeal,
  updateModerationAppealDraft,
  approveModerationAppeal,
  sendApprovedModerationAppealResolution,
  rerunModerationAppealResolutionDraft,
  resolveModerationAppealAccept,
  resolveModerationAppealReduce,
  dismissModerationAppeal,
  MODERATION_APPEAL_ACTIONS,
  MODERATION_APPEAL_STATUSES,
  type ModerationAppealAction,
  type ModerationAppealStatus,
} from '@services/moderation-appeals'
import { isModerationStaff } from '@services/users'
import { apiResponse } from '../../response-contract.mts'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'

app.route('/api/v1/appeals').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/appeals')

  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25

  const statusParam = ctx.query.status
  const status: ModerationAppealStatus =
    typeof statusParam === 'string' &&
    MODERATION_APPEAL_STATUSES.includes(statusParam as ModerationAppealStatus)
      ? (statusParam as ModerationAppealStatus)
      : 'pending'
  const isStaff = isModerationStaff(currentUser)

  // Non-staff see only their own appeals; `mine=true` also scopes staff callers.
  const appellantUserId = !isStaff || ctx.query.mine === 'true' ? currentUser.id : undefined
  const cursorScope = `appeals:${status}:${appellantUserId ?? 'staff-all'}:id-desc`
  const beforeId =
    typeof ctx.query.after === 'string'
      ? decodeScopedUuidCursor(ctx.query.after, cursorScope, 'Invalid cursor format').id
      : undefined

  const { appeals, hasNextPage } = await listModerationAppeals({
    status,
    limit,
    beforeId,
    appellantUserId,
  })

  const page_info = {
    has_next_page: hasNextPage,
    start_cursor: appeals[0] ? encodeScopedUuidCursor(appeals[0].id, cursorScope) : null,
    end_cursor:
      hasNextPage && appeals.at(-1)
        ? encodeScopedUuidCursor(appeals.at(-1)!.id, cursorScope)
        : null,
  }
  if (isStaff) {
    ctx.json(apiResponse('GET:/api/v1/appeals#staff', { appeals, page_info }))
    return
  }

  ctx.json({ appeals: listRedactedModerationAppeals(appeals), page_info })
})

app.route('/api/v1/appeals/:id').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/appeals/:id')
  const id = validateUUIDParam(ctx, 'id')

  const isStaff = isModerationStaff(currentUser)
  const appeal = await (isStaff && ctx.query.consistency === 'primary'
    ? getModerationAppealByIdFromPrimary(id)
    : getModerationAppealById(id))
  ctx.assert(appeal, 404, 'Appeal not found')
  const isOwner = appeal.appellant_id === currentUser.id

  ctx.assert(isStaff || isOwner, 403, 'Forbidden')

  ctx.json({ appeal: isStaff ? appeal : redactModerationAppeal(appeal) })
})

app.route('/api/v1/appeals/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveModerationAppeal,
    'PATCH:/api/v1/appeals/:id',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<{ public_response?: unknown; internal_notes?: unknown }>(ctx)

  const appeal = await updateModerationAppealDraft(currentUser.id, id, {
    publicResponse: typeof body.public_response === 'string' ? body.public_response : undefined,
    internalNotes: typeof body.internal_notes === 'string' ? body.internal_notes : undefined,
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
  const body = await parseJsonBody<{ action?: unknown }>(ctx)
  const action =
    typeof body.action === 'string' &&
    MODERATION_APPEAL_ACTIONS.includes(body.action as ModerationAppealAction)
      ? (body.action as ModerationAppealAction)
      : null

  ctx.assert(action, 422, 'action must be one of: accept, reduce, deny')
  let appeal
  if (action === 'accept') {
    appeal = await resolveModerationAppealAccept(currentUser.id, id)
  } else if (action === 'reduce') {
    appeal = await resolveModerationAppealReduce(currentUser.id, id)
  } else {
    appeal = await dismissModerationAppeal(currentUser.id, id)
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

  await rerunModerationAppealResolutionDraft(currentUser.id, id)

  ctx.setStatus(202)
  ctx.json(
    apiResponse('POST:/api/v1/appeals/:id/resolution-drafts#staff', {
      queued: true,
      rerun_by_id: currentUser.id,
    }),
  )
})
