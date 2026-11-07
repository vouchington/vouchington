import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { reviewCopyrightFormIntake } from '@services/copyright-notices'
import { rejectCopyrightEmailIntakeDecision } from '@services/copyright-notices/copyright-email-decision-actions'
import {
  parseCopyrightManualFallbackReason,
  parseCopyrightRecommendationId,
  parseCopyrightReplyEmail,
} from '@services/copyright-notices/moderator-http-input'
import { validateRequestContract } from '../../response-helpers.mts'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import type { CopyrightEmailRejectionRequest } from './email-intake-request-types.mts'
import type { CopyrightFormIntakeReviewRequest } from './staff-decision-request-types.mts'
import { parseCopyrightReviewRequest } from './moderator-review-request-helpers.mts'

app.route('/api/v1/copyright-form-intakes/:id/reviews').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-form-intakes/:id/reviews',
    CopyrightFormIntakeReviewRequest
  >('POST:/api/v1/copyright-form-intakes/:id/reviews')
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-form-intakes/:id/reviews',
  )
  ctx.assert(typeof body.is_accepted === 'boolean', 422, 'is_accepted must be a boolean')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-form-intakes/:id/reviews', {
    path: ctx.params,
    body,
  })
  const reviewed = await reviewCopyrightFormIntake({
    intakeId,
    currentUser,
    is_accepted: body.is_accepted,
    rationale: body.rationale as string,
  })
  ctx.json({
    copyright_notice: { id: reviewed.noticeId },
    copyright_submission: { id: reviewed.submissionId },
    is_accepted: reviewed.is_accepted,
  })
})

app.route('/api/v1/copyright-email-intakes/:id/rejections').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-email-intakes/:id/rejections',
    CopyrightEmailRejectionRequest
  >('POST:/api/v1/copyright-email-intakes/:id/rejections')
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-email-intakes/:id/rejections',
  )
  ctx.assert(
    body.response_kind === undefined ||
      body.response_kind === 'rejected' ||
      body.response_kind === 'needs_information',
    422,
    'response_kind must be rejected or needs_information',
  )
  const recommendationId = parseCopyrightRecommendationId(body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(body)
  const replyEmail = parseCopyrightReplyEmail(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/rejections', {
    path: ctx.params,
    body,
  })
  const decision = await rejectCopyrightEmailIntakeDecision({
    currentUser,
    intakeId,
    recommendationId,
    manualFallbackReason,
    rationale: body.rationale as string,
    replyEmail,
    responseKind: body.response_kind as 'rejected' | 'needs_information' | undefined,
    responseMessage: typeof body.response_message === 'string' ? body.response_message : null,
  })
  ctx.json(decision)
})
