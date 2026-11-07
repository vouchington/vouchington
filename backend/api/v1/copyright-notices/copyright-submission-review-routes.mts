import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  appendCopyrightLegalHoldAssessment,
  resolveCopyrightLegalHold,
  reviewCopyrightAppeal,
  reviewCopyrightCounterNotice,
} from '@services/copyright-notices'
import {
  parseCopyrightAppealDecisionInput,
  parseCopyrightLegalHoldAssessmentInput,
} from '@services/copyright-notices/copyright-mcp-case-input'
import { parseNullableCopyrightEnum } from '@services/copyright-notices/moderator-http-input'
import { validateRequestContract } from '../../response-helpers.mts'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import type { CopyrightLegalHoldResolutionRequest } from './staff-decision-request-types.mts'
import type {
  CopyrightAppealReviewRequest,
  CopyrightCounterNoticeReviewRequest,
  CopyrightLegalHoldAssessmentRequest,
} from './submission-review-request-types.mts'
import { parseCopyrightReviewRequest } from './moderator-review-request-helpers.mts'

app.route('/api/v1/copyright-submissions/:id/appeal-reviews').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-submissions/:id/appeal-reviews',
    CopyrightAppealReviewRequest
  >('POST:/api/v1/copyright-submissions/:id/appeal-reviews')
  const {
    currentUser,
    intakeId: submissionId,
    body,
  } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-submissions/:id/appeal-reviews',
  )
  const parsed = parseCopyrightAppealDecisionInput(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-submissions/:id/appeal-reviews', {
    path: ctx.params,
    body,
  })
  const result = await reviewCopyrightAppeal({
    submissionId,
    currentUser,
    ...parsed,
    rationale: body.rationale as string,
  })
  ctx.json({
    copyright_notice: { id: result.noticeId },
    review_ids: result.reviewIds,
  })
})

app.route('/api/v1/copyright-submissions/:id/counter-notice-reviews').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews',
    CopyrightCounterNoticeReviewRequest
  >('POST:/api/v1/copyright-submissions/:id/counter-notice-reviews')
  const {
    currentUser,
    intakeId: submissionId,
    body,
  } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews',
  )
  ctx.assert(typeof body.is_accepted === 'boolean', 422, 'is_accepted must be a boolean')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews', {
    path: ctx.params,
    body,
  })
  const result = await reviewCopyrightCounterNotice({
    submissionId,
    currentUser,
    is_accepted: body.is_accepted,
    rationale: body.rationale as string,
  })
  ctx.json({
    copyright_notice: { id: result.noticeId },
    assessment_id: result.assessmentId,
    deadline_id: result.deadlineId,
  })
})

app.route('/api/v1/copyright-submissions/:id/legal-hold-assessments').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-submissions/:id/legal-hold-assessments',
    CopyrightLegalHoldAssessmentRequest
  >('POST:/api/v1/copyright-submissions/:id/legal-hold-assessments')
  const {
    currentUser,
    intakeId: submissionId,
    body,
  } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-submissions/:id/legal-hold-assessments',
  )
  const parsed = parseCopyrightLegalHoldAssessmentInput(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-submissions/:id/legal-hold-assessments', {
    path: ctx.params,
    body,
  })
  const assessment = await appendCopyrightLegalHoldAssessment({
    currentUser,
    submissionId,
    assessedAt: new Date(),
    fromOriginalClaimant: body.is_from_original_claimant as boolean,
    sameMaterial: body.is_same_material as boolean,
    ...parsed,
    rationale: body.rationale as string,
  })
  ctx.setStatus(201)
  ctx.json({ copyright_legal_hold_assessment: assessment })
})

app.route('/api/v1/copyright-legal-hold-assessments/:id/resolutions').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions',
    CopyrightLegalHoldResolutionRequest
  >('POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions')
  const {
    currentUser,
    intakeId: assessmentId,
    body,
  } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions',
  )
  const resolutionKind = parseNullableCopyrightEnum(
    body.resolution_kind,
    ['dismissed', 'proceeding_ended', 'superseded'] as const,
    'resolution_kind',
  )
  ctx.assert(resolutionKind, 422, 'resolution_kind is required')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions', {
    path: ctx.params,
    body,
  })
  const resolution = await resolveCopyrightLegalHold({
    currentUser,
    assessmentId,
    resolvedAt: new Date(),
    resolutionKind,
    rationale: body.rationale as string,
  })
  ctx.setStatus(201)
  ctx.json({ copyright_legal_hold_resolution: resolution })
})
