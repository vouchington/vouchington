/* oxlint-disable max-lines -- Staff copyright decisions share one authorization and bounded-input route contract. */
import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { enqueueSendCopyrightEmailIntakeResponse } from '@queues/emails/enqueues'
import { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import { enqueueCreateImageEmbeddingsBatch } from '@queues/bedrock-embeddings-batch/enqueues'
import onError from '@modules/on-error'
import { findCopyrightImageSimilarityCandidates } from '@services/bedrock-embeddings-batch/image-similarity'
import { replayFailedMediaDeliveryRegistryRecords } from '@services/media-delivery-safety'
import {
  admitCopyrightEmailCorrespondence,
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
  listCopyrightStaffEmailIntakes,
  loadCopyrightEmailRawEvidence,
  appendCopyrightLegalHoldAssessment,
  resolveCopyrightLegalHold,
  replayFailedCopyrightDeliveryIntent,
} from '@services/copyright-notices'
import {
  boundedString,
  parseCopyrightNoticeForm,
  parseCopyrightTargetIds,
} from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiOpenApiRawResponse } from '../../response-contract.mts'
import {
  parseCopyrightCorrespondenceSubmission,
  parseCopyrightManualFallbackReason,
  parseCopyrightRecommendationId,
  parseCopyrightSimilarityCandidateLimit,
  parseNullableCopyrightDate,
  parseNullableCopyrightEnum,
} from '@services/copyright-notices/moderator-http-input'

app.route('/api/v1/copyright-email-intakes/review-queue').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/review-queue',
  )
  assertNotSuspended(currentUser)
  ctx.json({ copyright_email_intakes: await listCopyrightStaffEmailIntakes(currentUser) })
})
app.route('/api/v1/copyright-email-intakes/:id').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/:id',
  )
  assertNotSuspended(currentUser)
  const intake = await getCopyrightStaffEmailIntake(validateUUIDParam(ctx, 'id'), currentUser)
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
  const evidence = await loadCopyrightEmailRawEvidence(validateUUIDParam(ctx, 'id'), currentUser)
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

app
  .route('/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates')
  .get(async (ctx: Context) => {
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
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const intentId = validateUUIDParam(ctx, 'intentId')
    const replayed = await replayFailedCopyrightDeliveryIntent({
      intentId,
      noticeId,
      actorUserId: currentUser.id,
    })
    if (replayed) void enqueueDeliverCopyrightNotice(intentId)
    ctx.json({ replayed })
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
    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
    ctx.assert(
      body.action === 'confirm' || body.action === 'reverse',
      422,
      'action must be confirm or reverse',
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
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays',
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const intentId = validateUUIDParam(ctx, 'intentId')
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
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-email-intakes/:id/approvals',
  )
  const input = parseCopyrightNoticeForm(body)
  const targets = await Promise.all(
    input.targets.map(target => resolveCopyrightImagePlacement(target)),
  )
  const promoted = await promoteCopyrightEmailIntake({
    currentUser,
    intakeId,
    recommendationId: parseCopyrightRecommendationId(ctx, body),
    manualFallbackReason: parseCopyrightManualFallbackReason(ctx, body),
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
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-form-intakes/:id/reviews',
  )
  ctx.assert(typeof body.accepted === 'boolean', 422, 'accepted must be a boolean')
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
  const rejected = await rejectCopyrightEmailIntake({
    currentUser,
    intakeId,
    recommendationId: parseCopyrightRecommendationId(ctx, body),
    manualFallbackReason: parseCopyrightManualFallbackReason(ctx, body),
    rationale: body.rationale as string,
    responseKind: body.response_kind as 'rejected' | 'needs_information' | undefined,
    responseMessage: typeof body.response_message === 'string' ? body.response_message : null,
  })
  if (rejected.responseId) void enqueueSendCopyrightEmailIntakeResponse(rejected.responseId)
  ctx.setStatus(204)
})

app.route('/api/v1/copyright-submissions/:id/appeal-reviews').post(async (ctx: Context) => {
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
  const {
    currentUser,
    intakeId: submissionId,
    body,
  } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews',
  )
  ctx.assert(typeof body.accepted === 'boolean', 422, 'accepted must be a boolean')
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
    targetIds: parseCopyrightTargetIds(body.target_ids),
    rationale: body.rationale as string,
  })
  ctx.setStatus(201)
  ctx.json({ copyright_legal_hold_assessment: assessment })
})

app.route('/api/v1/copyright-legal-hold-assessments/:id/resolutions').post(async (ctx: Context) => {
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
  const admitted = await admitCopyrightEmailCorrespondence({
    currentUser,
    intakeId,
    kind: body.kind as (typeof kinds)[number],
    targetIds:
      body.kind === 'appeal' || body.kind === 'counter_notice'
        ? parseCopyrightTargetIds(body.target_ids)
        : [],
    structuredSubmission: parseCopyrightCorrespondenceSubmission(ctx, body),
    rationale: body.rationale as string,
    recommendationId: parseCopyrightRecommendationId(ctx, body),
    manualFallbackReason: parseCopyrightManualFallbackReason(ctx, body),
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
    const rejected = await rejectCopyrightEmailCorrespondence({
      currentUser,
      intakeId,
      kind: body.kind as (typeof kinds)[number],
      rationale: body.rationale as string,
      recommendationId: parseCopyrightRecommendationId(ctx, body),
      manualFallbackReason: parseCopyrightManualFallbackReason(ctx, body),
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
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
  return { currentUser, intakeId, body }
}

async function enqueueMissingSourceImageEmbedding(): Promise<void> {
  try {
    await enqueueCreateImageEmbeddingsBatch()
  } catch (error) {
    onError(
      error instanceof Error
        ? error
        : new Error('Failed to enqueue source image embedding batch', { cause: error }),
    )
  }
}
