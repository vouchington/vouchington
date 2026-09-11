import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuth,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  parseCreateReviewDisputeInput,
  createReviewDispute,
  getReviewDisputeById,
  listReviewDisputes,
  redactReviewDispute,
  listRedactedReviewDisputes,
  currentUserCanResolveReviewDispute,
  updateReviewDisputeDraft,
  approveReviewDispute,
  sendApprovedReviewDisputeResolution,
  resolveReviewDisputeRemove,
  resolveReviewDisputeAnnotate,
  dismissReviewDispute,
  REVIEW_DISPUTE_RESOLUTION_ACTIONS,
  REVIEW_DISPUTE_STATUSES,
  type ReviewDisputeResolutionAction,
  type ReviewDisputeStatus,
} from '@services/review-disputes'
import { isModerationStaff } from '@services/users'
import { apiResponse } from '../../response-contract.mts'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { filterReviewDisputePostContentForViewer } from './dispute-post-content-visibility.mts'
import './dispute-resolution-drafts.mts'

// POST /api/v1/disputes — file a review dispute
app.route('/api/v1/disputes').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/disputes')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'disputes.create' })

  const input = parseCreateReviewDisputeInput(body)
  const { dispute, isDuplicate } = await createReviewDispute(currentUser, input)

  ctx.setStatus(isDuplicate ? 200 : 201)
  const [viewerDispute] = await filterReviewDisputePostContentForViewer(currentUser, [dispute])
  ctx.json({ dispute: redactReviewDispute(viewerDispute!), isDuplicate })
})

// GET /api/v1/disputes — list disputes (staff: full, member: redacted)
app.route('/api/v1/disputes').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/disputes')

  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25

  const statusParam = ctx.query.status
  const status: ReviewDisputeStatus =
    typeof statusParam === 'string' &&
    REVIEW_DISPUTE_STATUSES.includes(statusParam as ReviewDisputeStatus)
      ? (statusParam as ReviewDisputeStatus)
      : 'pending'

  const disputantUserId = ctx.query.mine === 'true' ? currentUser.id : undefined
  const isStaff = isModerationStaff(currentUser)
  const audience = isStaff ? 'staff' : 'member'
  const cursorScope = `disputes:${status}:${audience}:${disputantUserId ?? 'all'}:id-desc`
  const beforeId =
    typeof ctx.query.after === 'string'
      ? decodeScopedUuidCursor(ctx.query.after, cursorScope, 'Invalid cursor format').id
      : undefined

  const { disputes, hasNextPage } = await listReviewDisputes({
    status,
    limit,
    beforeId,
    disputantUserId,
  })
  const viewerDisputes = await filterReviewDisputePostContentForViewer(currentUser, disputes)

  const page_info = {
    has_next_page: hasNextPage,
    start_cursor: viewerDisputes[0]
      ? encodeScopedUuidCursor(viewerDisputes[0].id, cursorScope)
      : null,
    end_cursor:
      hasNextPage && viewerDisputes.at(-1)
        ? encodeScopedUuidCursor(viewerDisputes.at(-1)!.id, cursorScope)
        : null,
  }
  if (isStaff) {
    ctx.json(apiResponse('GET:/api/v1/disputes#staff', { disputes: viewerDisputes, page_info }))
    return
  }

  ctx.json({ disputes: listRedactedReviewDisputes(viewerDisputes), page_info })
})

// GET /api/v1/disputes/:id — get a single dispute
app.route('/api/v1/disputes/:id').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/disputes/:id')
  const id = validateUUIDParam(ctx, 'id')

  const dispute = await getReviewDisputeById(id)
  ctx.assert(dispute, 404, 'Dispute not found')
  const [viewerDispute] = await filterReviewDisputePostContentForViewer(currentUser, [dispute])

  const isStaff = isModerationStaff(currentUser)
  if (isStaff) {
    ctx.json(apiResponse('GET:/api/v1/disputes/:id#staff', { dispute: viewerDispute! }))
    return
  }

  ctx.json({ dispute: redactReviewDispute(viewerDispute!) })
})

// PATCH /api/v1/disputes/:id — edit dispute draft (staff only)
app.route('/api/v1/disputes/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanResolveReviewDispute,
    'PATCH:/api/v1/disputes/:id',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<{ public_response?: unknown; internal_notes?: unknown }>(ctx)

  const dispute = await updateReviewDisputeDraft(currentUser.id, id, {
    publicResponse: typeof body.public_response === 'string' ? body.public_response : undefined,
    internalNotes: typeof body.internal_notes === 'string' ? body.internal_notes : undefined,
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
  const body = await parseJsonBody<{ action?: unknown; body_text?: unknown }>(ctx)
  const action =
    typeof body.action === 'string' &&
    REVIEW_DISPUTE_RESOLUTION_ACTIONS.includes(body.action as ReviewDisputeResolutionAction)
      ? (body.action as ReviewDisputeResolutionAction)
      : null

  ctx.assert(action, 422, 'action must be one of: remove, annotate, dismiss')

  let dispute
  if (action === 'remove') {
    dispute = await resolveReviewDisputeRemove(currentUser.id, id)
  } else if (action === 'annotate') {
    ctx.assert(typeof body.body_text === 'string', 422, 'body_text is required for annotate')
    dispute = await resolveReviewDisputeAnnotate(currentUser.id, id, body.body_text)
  } else {
    dispute = await dismissReviewDispute(currentUser.id, id)
  }

  ctx.setStatus(200)
  ctx.json(apiResponse('POST:/api/v1/disputes/:id/resolution#staff', { dispute }))
})
