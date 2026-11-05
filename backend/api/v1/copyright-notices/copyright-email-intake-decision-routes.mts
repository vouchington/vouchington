import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryString } from '@vouchington/pagination'
import { enqueueReplayMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import {
  assertCopyrightIntakeEnabled,
  currentUserCanReviewCopyrightNotices,
} from '@services/copyright-notices'
import { approveCopyrightEmailIntakeDecision } from '@services/copyright-notices/copyright-email-decision-actions'
import { associateCopyrightEmailIntakeWithNotice } from '@services/copyright-notices/email-manual-association'
import { searchCopyrightNoticeAssociationTargets } from '@services/copyright-notices/association-search'
import { parseCopyrightNoticeForm } from '@services/copyright-notices/http-input'
import {
  parseCopyrightManualFallbackReason,
  parseCopyrightRecommendationId,
} from '@services/copyright-notices/moderator-http-input'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery } from '../../api-query-contract.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import type {
  CopyrightEmailApprovalRequest,
  CopyrightEmailNoticeAssociationRequest,
} from './email-intake-request-types.mts'
import { parseCopyrightReviewRequest } from './moderator-review-request-helpers.mts'

app.route('/api/v1/copyright-media-delivery/replays').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-media-delivery/replays',
  )
  assertNotSuspended(currentUser)
  await enqueueReplayMediaDeliveryRegistry({ actorUserId: currentUser.id })
  ctx.setStatus(202)
  ctx.json({})
})

app.route('/api/v1/copyright-email-intakes/:id/approvals').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-email-intakes/:id/approvals',
    CopyrightEmailApprovalRequest
  >('POST:/api/v1/copyright-email-intakes/:id/approvals')
  // Approving an email creates a new notice, so it follows the intake kill switch like the notice
  // forms. Rejections and in-case correspondence decisions stay available while intake is off.
  setPrivateNoStoreCacheHeaders(ctx)
  assertCopyrightIntakeEnabled()
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-email-intakes/:id/approvals',
  )
  const input = parseCopyrightNoticeForm(body)
  const recommendationId = parseCopyrightRecommendationId(body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/approvals', {
    path: ctx.params,
    body,
  })
  const decision = await approveCopyrightEmailIntakeDecision(
    currentUser,
    intakeId,
    input,
    recommendationId,
    manualFallbackReason,
    body.rationale as string,
  )
  ctx.setStatus(201)
  ctx.json(decision)
})

app.route('/api/v1/copyright-email-intakes/:id/notice-associations').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-email-intakes/:id/notice-associations',
    CopyrightEmailNoticeAssociationRequest
  >('POST:/api/v1/copyright-email-intakes/:id/notice-associations')
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-email-intakes/:id/notice-associations',
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  const parsedBody: unknown = await parseJsonBody(ctx, '1mb')
  const body = parsedBody as Record<string, unknown>
  ctx.assert(typeof body.copyright_notice_id === 'string', 422, 'copyright_notice_id is required')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/notice-associations', {
    path: ctx.params,
    body,
  })
  const association = await associateCopyrightEmailIntakeWithNotice(
    currentUser,
    intakeId,
    body.copyright_notice_id as string,
  )
  ctx.setStatus(201)
  ctx.json(association)
})

const associationSearchQuery = defineQueryContract({ q: queryString(), after: queryString() })

app.route('/api/v1/copyright-notices/association-targets').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices/association-targets', associationSearchQuery)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-notices/association-targets',
  )
  assertNotSuspended(currentUser)
  const q = typeof ctx.query.q === 'string' ? ctx.query.q : ''
  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  validateRequestContract(ctx, 'GET:/api/v1/copyright-notices/association-targets', {
    query: { q, ...(after ? { after } : {}) },
  })
  ctx.json(await searchCopyrightNoticeAssociationTargets(currentUser, q, after))
})
