import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuthAndRateLimit,
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
  const body = await parseJsonBody<{ rejection_reason?: unknown }>(ctx)
  ctx.assert(typeof body.rejection_reason === 'string', 422, 'rejection_reason is required')
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
  const body = await parseJsonBody<{ revocation_reason?: unknown }>(ctx)
  ctx.assert(typeof body.revocation_reason === 'string', 422, 'revocation_reason is required')
  const claim = await revokeTopicClaim(currentUser.id, id, body.revocation_reason)
  ctx.json({ claim })
})
