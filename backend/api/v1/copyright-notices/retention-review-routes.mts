import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanReviewCopyrightNotices,
  closeCopyrightTerritorialEscalation,
  resolveCopyrightEuSupervisedComplaint,
  placeCopyrightCasePreservationHold,
  releaseCopyrightCasePreservationHold,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

type CopyrightCasePreservationHoldRequest = {
  kind: 'litigation_threat' | 'regulator_request' | 'court_request'
}

app
  .route('/api/v1/copyright-notices/:id/escalations/:escalationId/closures')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const actor = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/escalations/:escalationId/closures',
    )
    assertNotSuspended(actor)
    const noticeId = validateUUIDParam(ctx, 'id')
    const escalationId = validateUUIDParam(ctx, 'escalationId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/escalations/:escalationId/closures',
      { path: ctx.params },
    )
    const closure = await closeCopyrightTerritorialEscalation(actor, noticeId, escalationId)
    ctx.setStatus(201)
    ctx.json({ copyright_territorial_escalation_closure: closure })
  })

app
  .route('/api/v1/copyright-notices/:id/supervised-complaints/:complaintId/resolutions')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const actor = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/supervised-complaints/:complaintId/resolutions',
    )
    assertNotSuspended(actor)
    const noticeId = validateUUIDParam(ctx, 'id')
    const complaintId = validateUUIDParam(ctx, 'complaintId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/supervised-complaints/:complaintId/resolutions',
      { path: ctx.params },
    )
    const resolution = await resolveCopyrightEuSupervisedComplaint(actor, noticeId, complaintId)
    ctx.setStatus(201)
    ctx.json({ copyright_eu_supervised_complaint_resolution: resolution })
  })

app.route('/api/v1/copyright-notices/:id/preservation-holds').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const actor = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-notices/:id/preservation-holds',
  )
  assertNotSuspended(actor)
  const noticeId = validateUUIDParam(ctx, 'id')
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightCasePreservationHoldRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-notices/:id/preservation-holds', {
    path: ctx.params,
    body,
  })
  const hold = await placeCopyrightCasePreservationHold(actor, noticeId, body.kind)
  ctx.setStatus(201)
  ctx.json({ copyright_case_preservation_hold: hold })
})

app
  .route('/api/v1/copyright-notices/:id/preservation-holds/:holdId/releases')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const actor = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/preservation-holds/:holdId/releases',
    )
    assertNotSuspended(actor)
    const noticeId = validateUUIDParam(ctx, 'id')
    const holdId = validateUUIDParam(ctx, 'holdId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/preservation-holds/:holdId/releases',
      { path: ctx.params },
    )
    const released = await releaseCopyrightCasePreservationHold(actor, noticeId, holdId)
    ctx.setStatus(201)
    ctx.json({ copyright_case_preservation_hold_release: released })
  })
