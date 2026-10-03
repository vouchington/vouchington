/* oxlint-disable max-lines -- Staff copyright decisions share one authorization and bounded-input route contract. */
import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryInteger } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { enqueueSendCopyrightNoticeEmail } from '@queues/emails/enqueues'
import { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import { enqueueCreateImageEmbeddingsBatch } from '@queues/bedrock-embeddings-batch/enqueues'
import onError from '@modules/on-error'
import { findCopyrightImageSimilarityCandidates } from '@services/bedrock-embeddings-batch/image-similarity'
import { replayFailedMediaDeliveryRegistryRecords } from '@services/media-delivery-safety'
import {
  admitCopyrightEmailCorrespondence,
  assertCopyrightIntakeEnabled,
  rejectCopyrightEmailCorrespondence,
  currentUserCanReviewCopyrightNotices,
  promoteCopyrightEmailIntake,
  rejectCopyrightEmailIntake,
  resolveCopyrightImagePlacement,
  reviewCopyrightFormIntake,
  reviewCopyrightAppeal,
  reviewCopyrightCounterNotice,
  completeCopyrightMandatoryHumanReview,
  replayFailedCopyrightActionIntent,
  getCopyrightStaffEmailIntake,
  loadCopyrightEmailRawEvidence,
  appendCopyrightLegalHoldAssessment,
  resolveCopyrightLegalHold,
  replayFailedCopyrightDeliveryIntent,
  reviewCopyrightStaydownMatch,
} from '@services/copyright-notices'
import {
  boundedString,
  parseCopyrightNoticeForm,
  parseCopyrightTargetIds,
} from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  apiNoRequestBody,
  apiOpenApiRawResponse,
  apiQuery,
  apiRequestContract,
} from '../../response-contract.mts'
import type {
  CopyrightEmailApprovalRequest,
  CopyrightEmailCorrespondenceRejectionRequest,
  CopyrightEmailCorrespondenceRequest,
  CopyrightEmailRejectionRequest,
} from './email-intake-request-types.mts'
import type {
  CopyrightFormIntakeReviewRequest,
  CopyrightLegalHoldResolutionRequest,
  CopyrightRestrictionReviewRequest,
} from './staff-decision-request-types.mts'
import type {
  CopyrightAppealReviewRequest,
  CopyrightCounterNoticeReviewRequest,
  CopyrightLegalHoldAssessmentRequest,
} from './submission-review-request-types.mts'
import {
  parseCopyrightCorrespondenceSubmission,
  parseCopyrightManualFallbackReason,
  parseCopyrightRecommendationId,
  parseCopyrightReplyEmail,
  parseCopyrightSimilarityCandidateLimit,
  parseNullableCopyrightDate,
  parseNullableCopyrightEnum,
} from '@services/copyright-notices/moderator-http-input'

app.route('/api/v1/copyright-email-intakes/:id').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/:id',
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-email-intakes/:id', { path: ctx.params })
  const intake = await getCopyrightStaffEmailIntake(intakeId, currentUser)
  ctx.assert(intake, 404, 'Copyright email intake not found')
  ctx.json({ copyright_email_intake: intake })
})

app.route('/api/v1/copyright-email-intakes/:id/raw').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/:id/raw',
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-email-intakes/:id/raw', { path: ctx.params })
  const evidence = await loadCopyrightEmailRawEvidence(intakeId, currentUser)
  ctx.assert(evidence, 404, 'Copyright email intake not found')
  ctx.set('Content-Type', 'message/rfc822')
  ctx.set('Content-Disposition', 'attachment; filename="original-email.eml"')
  ctx.set('X-Content-Type-Options', 'nosniff')
  ctx.set('Digest', `sha-256=${Buffer.from(evidence.sha256, 'hex').toString('base64')}`)
  await ctx.pipeline(
    Readable.from([
      apiOpenApiRawResponse(
        'GET:/api/v1/copyright-email-intakes/:id/raw',
        'message/rfc822',
        evidence.bytes,
      ),
    ]),
  )
})

// The limit stays lenient: a malformed or out-of-range value is ignored and the default applies, so
// the contract validates the value the parser settled on rather than the raw query string.
const similarityCandidateQueryContract = defineQueryContract({
  limit: queryInteger(
    { minimum: 1, maximum: 50 },
    { description: 'Maximum candidates to return. A malformed or out-of-range value is ignored.' },
  ),
})

app
  .route('/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates')
  .get(async (ctx: Context) => {
    apiQuery(
      'GET:/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates',
      similarityCandidateQueryContract,
    )
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'GET:/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const targetId = validateUUIDParam(ctx, 'targetId')
    const limit = parseCopyrightSimilarityCandidateLimit(ctx.query.limit)
    validateRequestContract(
      ctx,
      'GET:/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates',
      { path: ctx.params, query: limit === undefined ? {} : { limit } },
    )
    const result = await findCopyrightImageSimilarityCandidates({ noticeId, targetId, limit })
    ctx.assert(result.sourceImageId, 404, 'Copyright notice target not found')
    if (result.availability === 'unavailable') void enqueueMissingSourceImageEmbedding()
    ctx.json({
      availability: result.availability,
      copyright_image_similarity_candidates: result.candidates.map(candidate => ({
        placement_id: candidate.placementId,
        placement_revision: candidate.placementRevision,
        image_id: candidate.imageId,
        post_id: candidate.postId,
        similarity: candidate.similarity,
      })),
    })
  })

app
  .route('/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays')
  .post(async (ctx: Context) => {
    apiNoRequestBody('POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays')
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const intentId = validateUUIDParam(ctx, 'intentId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
      { path: ctx.params },
    )
    const replayed = await replayFailedCopyrightDeliveryIntent({
      intentId,
      noticeId,
      actorUserId: currentUser.id,
    })
    if (replayed) void enqueueDeliverCopyrightNotice(intentId)
    ctx.json({ replayed })
  })

app
  .route('/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews')
  .post(async (ctx: Context) => {
    apiNoRequestBody('POST:/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews')
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const matchId = validateUUIDParam(ctx, 'matchId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews',
      { path: ctx.params },
    )
    const reviewed = await reviewCopyrightStaydownMatch({
      noticeId,
      matchId,
      actorUserId: currentUser.id,
    })
    ctx.json({ reviewed })
  })

app
  .route('/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const restrictionId = validateUUIDParam(ctx, 'restrictionId')
    const body = (await ctx.request.json('1mb')) as CopyrightRestrictionReviewRequest
    assertObjectBody(ctx, body)
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    ctx.assert(
      body.action === 'confirm' || body.action === 'reverse',
      422,
      'action must be confirm or reverse',
    )
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews',
      { path: ctx.params, body },
    )
    const restriction = await completeCopyrightMandatoryHumanReview({
      currentUser,
      noticeId,
      restrictionId,
      action: body.action,
      rationale: body.rationale,
      reviewedAt: new Date(),
    })
    ctx.json({ copyright_restriction: restriction })
  })

app
  .route('/api/v1/copyright-notices/:id/action-intents/:intentId/replays')
  .post(async (ctx: Context) => {
    apiNoRequestBody('POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays')
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const intentId = validateUUIDParam(ctx, 'intentId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays',
      { path: ctx.params },
    )
    const replayed = await replayFailedCopyrightActionIntent({
      intentId,
      noticeId,
      actorUserId: currentUser.id,
    })
    ctx.json({ replayed })
  })

app.route('/api/v1/copyright-media-delivery/replays').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-media-delivery/replays',
  )
  assertNotSuspended(currentUser)
  const replayed = await replayFailedMediaDeliveryRegistryRecords({ actorUserId: currentUser.id })
  ctx.json({ replayed })
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
  const recommendationId = parseCopyrightRecommendationId(ctx, body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(ctx, body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/approvals', {
    path: ctx.params,
    body,
  })
  const targets = await Promise.all(
    input.targets.map(target => resolveCopyrightImagePlacement(target)),
  )
  const promoted = await promoteCopyrightEmailIntake({
    currentUser,
    intakeId,
    recommendationId,
    manualFallbackReason,
    jurisdiction: input.jurisdiction,
    claimantDisplayName: input.claimantDisplayName,
    claimantContact: input.claimantContact,
    claimantEmail: input.claimantEmail,
    workDescription: input.workDescription,
    goodFaithBelief: input.goodFaithBelief,
    accuracyAuthorityUnderPenaltyOfPerjury: input.accuracyAuthorityUnderPenaltyOfPerjury,
    electronicSignature: input.electronicSignature,
    targets,
    rationale: body.rationale as string,
  })
  ctx.setStatus(201)
  ctx.json({
    copyright_notice: { id: promoted.noticeId },
    copyright_submission: { id: promoted.submissionId },
  })
})

app.route('/api/v1/copyright-form-intakes/:id/reviews').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-form-intakes/:id/reviews',
    CopyrightFormIntakeReviewRequest
  >('POST:/api/v1/copyright-form-intakes/:id/reviews')
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-form-intakes/:id/reviews',
  )
  ctx.assert(typeof body.accepted === 'boolean', 422, 'accepted must be a boolean')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-form-intakes/:id/reviews', {
    path: ctx.params,
    body,
  })
  const reviewed = await reviewCopyrightFormIntake({
    intakeId,
    currentUser,
    accepted: body.accepted,
    rationale: body.rationale as string,
  })
  ctx.json({
    copyright_notice: { id: reviewed.noticeId },
    copyright_submission: { id: reviewed.submissionId },
    accepted: reviewed.accepted,
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
  const recommendationId = parseCopyrightRecommendationId(ctx, body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(ctx, body)
  const replyEmail = parseCopyrightReplyEmail(ctx, body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/rejections', {
    path: ctx.params,
    body,
  })
  const rejected = await rejectCopyrightEmailIntake({
    currentUser,
    intakeId,
    recommendationId,
    manualFallbackReason,
    rationale: body.rationale as string,
    replyEmail,
    responseKind: body.response_kind as 'rejected' | 'needs_information' | undefined,
    responseMessage: typeof body.response_message === 'string' ? body.response_message : null,
  })
  if (rejected.responseId) void enqueueSendCopyrightNoticeEmail(rejected.responseId)
  ctx.json({ reply_queued: rejected.replyQueued })
})

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
  const rawDecisions = body.decisions
  ctx.assert(
    Array.isArray(rawDecisions) && rawDecisions.length > 0 && rawDecisions.length <= 20,
    422,
    'decisions are required',
  )
  const decisions = rawDecisions.map(value => {
    ctx.assert(value && typeof value === 'object', 422, 'decision must be an object')
    const decision = value as Record<string, unknown>
    ctx.assert(
      typeof decision.restriction_id === 'string' && isUUID(decision.restriction_id),
      422,
      'restriction_id must be a UUID',
    )
    ctx.assert(
      decision.action === 'confirm' || decision.action === 'reverse',
      422,
      'action must be confirm or reverse',
    )
    return {
      restrictionId: decision.restriction_id,
      action: decision.action as 'confirm' | 'reverse',
    }
  })
  const recommendationId = parseCopyrightRecommendationId(ctx, body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(ctx, body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-submissions/:id/appeal-reviews', {
    path: ctx.params,
    body,
  })
  const result = await reviewCopyrightAppeal({
    submissionId,
    currentUser,
    recommendationId,
    manualFallbackReason,
    rationale: body.rationale as string,
    decisions,
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
  ctx.assert(typeof body.accepted === 'boolean', 422, 'accepted must be a boolean')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews', {
    path: ctx.params,
    body,
  })
  const result = await reviewCopyrightCounterNotice({
    submissionId,
    currentUser,
    accepted: body.accepted,
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
  const proceedingKind = parseNullableCopyrightEnum(
    ctx,
    body.proceeding_kind,
    ['federal_court', 'ccb'] as const,
    'proceeding_kind',
  )
  const ccbClaimKind = parseNullableCopyrightEnum(
    ctx,
    body.ccb_claim_kind,
    ['claim', 'counterclaim'] as const,
    'ccb_claim_kind',
  )
  const commencedAt = parseNullableCopyrightDate(ctx, body.commenced_at, 'commenced_at')
  const receivedByDesignatedAgentAt = parseNullableCopyrightDate(
    ctx,
    body.received_by_designated_agent_at,
    'received_by_designated_agent_at',
  )
  ctx.assert(
    typeof body.from_original_claimant === 'boolean',
    422,
    'from_original_claimant is required',
  )
  ctx.assert(typeof body.same_material === 'boolean', 422, 'same_material is required')
  ctx.assert(
    (proceedingKind === null && commencedAt === null) ||
      (proceedingKind !== null && commencedAt !== null),
    422,
    'commenced_at is required for a proceeding',
  )
  ctx.assert(
    (proceedingKind === 'ccb' && ccbClaimKind !== null) ||
      (proceedingKind !== 'ccb' && ccbClaimKind === null),
    422,
    'ccb_claim_kind is required only for a CCB proceeding',
  )
  const targetIds = parseCopyrightTargetIds(body.target_ids)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-submissions/:id/legal-hold-assessments', {
    path: ctx.params,
    body,
  })
  const assessment = await appendCopyrightLegalHoldAssessment({
    currentUser,
    submissionId,
    assessedAt: new Date(),
    fromOriginalClaimant: body.from_original_claimant,
    proceedingKind,
    ccbClaimKind,
    commencedAt,
    receivedByDesignatedAgentAt,
    sameMaterial: body.same_material,
    targetIds,
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
    ctx,
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

app.route('/api/v1/copyright-email-intakes/:id/correspondence').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-email-intakes/:id/correspondence',
    CopyrightEmailCorrespondenceRequest
  >('POST:/api/v1/copyright-email-intakes/:id/correspondence')
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-email-intakes/:id/correspondence',
  )
  const kinds = [
    'supplement',
    'appeal',
    'counter_notice',
    'withdrawal',
    'court_or_ccb_hold',
  ] as const
  ctx.assert(
    kinds.includes(body.kind as (typeof kinds)[number]),
    422,
    'Invalid correspondence kind',
  )
  const targetIds =
    body.kind === 'appeal' || body.kind === 'counter_notice'
      ? parseCopyrightTargetIds(body.target_ids)
      : []
  const structuredSubmission = parseCopyrightCorrespondenceSubmission(ctx, body)
  const recommendationId = parseCopyrightRecommendationId(ctx, body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(ctx, body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/correspondence', {
    path: ctx.params,
    body,
  })
  const admitted = await admitCopyrightEmailCorrespondence({
    currentUser,
    intakeId,
    kind: body.kind as (typeof kinds)[number],
    targetIds,
    structuredSubmission,
    rationale: body.rationale as string,
    recommendationId,
    manualFallbackReason,
  })
  ctx.setStatus(admitted.isDuplicate ? 200 : 201)
  ctx.json({
    copyright_notice: { id: admitted.noticeId },
    copyright_submission: { id: admitted.submissionId },
    copyright_correspondence: { id: admitted.correspondenceId },
    is_duplicate: admitted.isDuplicate,
  })
})

app
  .route('/api/v1/copyright-email-intakes/:id/correspondence-rejections')
  .post(async (ctx: Context) => {
    apiRequestContract<
      'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
      CopyrightEmailCorrespondenceRejectionRequest
    >('POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections')
    const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
      ctx,
      'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
    )
    const kinds = [
      'supplement',
      'appeal',
      'counter_notice',
      'withdrawal',
      'court_or_ccb_hold',
    ] as const
    ctx.assert(
      kinds.includes(body.kind as (typeof kinds)[number]),
      422,
      'Invalid correspondence kind',
    )
    const recommendationId = parseCopyrightRecommendationId(ctx, body)
    const manualFallbackReason = parseCopyrightManualFallbackReason(ctx, body)
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
      { path: ctx.params, body },
    )
    const rejected = await rejectCopyrightEmailCorrespondence({
      currentUser,
      intakeId,
      kind: body.kind as (typeof kinds)[number],
      rationale: body.rationale as string,
      recommendationId,
      manualFallbackReason,
    })
    ctx.setStatus(rejected.isDuplicate ? 200 : 201)
    ctx.json({
      copyright_notice: { id: rejected.noticeId },
      is_duplicate: rejected.isDuplicate,
    })
  })

async function parseCopyrightReviewRequest(ctx: Context, routeId: string) {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    routeId,
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  const parsedBody: unknown = await ctx.request.json('1mb')
  assertObjectBody(ctx, parsedBody)
  const body = parsedBody as Record<string, unknown>
  ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
  return { currentUser, intakeId, body }
}

// A JSON `null`, array or scalar has no fields to read; refuse it before the first field read so it
// answers 422 instead of throwing a TypeError (500).
function assertObjectBody(ctx: Context, body: unknown) {
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    422,
    'Invalid request body',
  )
}

async function enqueueMissingSourceImageEmbedding(): Promise<void> {
  try {
    await enqueueCreateImageEmbeddingsBatch()
  } catch (err) {
    onError(
      err instanceof Error
        ? err
        : new Error('Failed to enqueue source image embedding batch', { cause: err }),
    )
  }
}
