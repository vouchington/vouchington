import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
  parseJsonBody,
} from '../../response-helpers.mts'
import {
  listPendingTopicClaims,
  adminVerifyTopicClaim,
  rejectTopicClaim,
  revokeTopicClaim,
  currentUserCanReviewTopicClaims,
} from '@services/topic-claims'

type RejectTopicClaimRequest = { rejection_reason: string }
type RevokeTopicClaimRequest = { revocation_reason: string }

// GET /api/v1/admin/topic-claims — pending claims queue (moderation staff only)
app.route('/api/v1/admin/topic-claims').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewTopicClaims,
    'GET:/api/v1/admin/topic-claims',
  )
  const claims = await listPendingTopicClaims()
  ctx.json({ claims })
})

// POST /api/v1/admin/topic-claims/:id/verification — verify a claim (moderation staff only)
app.route('/api/v1/admin/topic-claims/:id/verification').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewTopicClaims,
    'POST:/api/v1/admin/topic-claims/:id/verification',
  )
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/admin/topic-claims/:id/verification', {
    path: ctx.params,
  })
  const claim = await adminVerifyTopicClaim(currentUser.id, id)
  ctx.json({ claim })
})

// POST /api/v1/admin/topic-claims/:id/rejection — reject a claim (moderation staff only)
app.route('/api/v1/admin/topic-claims/:id/rejection').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewTopicClaims,
    'POST:/api/v1/admin/topic-claims/:id/rejection',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<RejectTopicClaimRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/admin/topic-claims/:id/rejection', {
    body,
    path: ctx.params,
  })
  const claim = await rejectTopicClaim(currentUser.id, id, body.rejection_reason)
  ctx.json({ claim })
})

// POST /api/v1/admin/topic-claims/:id/revocation — revoke a verified claim (moderation staff only)
app.route('/api/v1/admin/topic-claims/:id/revocation').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewTopicClaims,
    'POST:/api/v1/admin/topic-claims/:id/revocation',
  )
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<RevokeTopicClaimRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/admin/topic-claims/:id/revocation', {
    body,
    path: ctx.params,
  })
  const claim = await revokeTopicClaim(currentUser.id, id, body.revocation_reason)
  ctx.json({ claim })
})
