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
import { replayFailedMediaDeliveryRegistryRecords } from '@services/images/delivery-registry'
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
  await ctx.pipeline(Readable.from([evidence.bytes]))
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
    const limit = parseSimilarityCandidateLimit(ctx.query.limit)
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
  const { currentUser, intakeId, body } = await parseReviewRequest(
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
    recommendationId: parseRecommendationId(ctx, body),
    manualFallbackReason: parseManualFallbackReason(ctx, body),
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
  const { currentUser, intakeId, body } = await parseReviewRequest(
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
  const { currentUser, intakeId, body } = await parseReviewRequest(
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
    recommendationId: parseRecommendationId(ctx, body),
    manualFallbackReason: parseManualFallbackReason(ctx, body),
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
  } = await parseReviewRequest(ctx, 'POST:/api/v1/copyright-submissions/:id/appeal-reviews')
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
  const recommendationId = parseRecommendationId(ctx, body)
  const manualFallbackReason = parseManualFallbackReason(ctx, body)
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
  } = await parseReviewRequest(ctx, 'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews')
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
  } = await parseReviewRequest(ctx, 'POST:/api/v1/copyright-submissions/:id/legal-hold-assessments')
  const proceedingKind = parseNullableEnum(
    ctx,
    body.proceeding_kind,
    ['federal_court', 'ccb'] as const,
    'proceeding_kind',
  )
  const ccbClaimKind = parseNullableEnum(
    ctx,
    body.ccb_claim_kind,
    ['claim', 'counterclaim'] as const,
    'ccb_claim_kind',
  )
  const commencedAt = parseNullableDate(ctx, body.commenced_at, 'commenced_at')
  const receivedByDesignatedAgentAt = parseNullableDate(
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
  } = await parseReviewRequest(ctx, 'POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions')
  const resolutionKind = parseNullableEnum(
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
  const { currentUser, intakeId, body } = await parseReviewRequest(
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
    structuredSubmission: parseCorrespondenceSubmission(ctx, body),
    rationale: body.rationale as string,
    recommendationId: parseRecommendationId(ctx, body),
    manualFallbackReason: parseManualFallbackReason(ctx, body),
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
    const { currentUser, intakeId, body } = await parseReviewRequest(
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
      recommendationId: parseRecommendationId(ctx, body),
      manualFallbackReason: parseManualFallbackReason(ctx, body),
    })
    ctx.setStatus(rejected.isDuplicate ? 200 : 201)
    ctx.json({
      copyright_notice: { id: rejected.noticeId },
      is_duplicate: rejected.isDuplicate,
    })
  })

async function parseReviewRequest(ctx: Context, routeId: string) {
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

function parseRecommendationId(ctx: Context, body: Record<string, unknown>): string | null {
  const value = body.recommendation_id
  ctx.assert(
    value === null || value === undefined || (typeof value === 'string' && isUUID(value)),
    422,
    'recommendation_id must be a UUID or null',
  )
  return (value as string | null | undefined) ?? null
}

function parseManualFallbackReason(ctx: Context, body: Record<string, unknown>): string | null {
  const value = body.manual_fallback_reason
  ctx.assert(
    value === null || value === undefined || boundedString(value, 10_000),
    422,
    'manual_fallback_reason must be a bounded string or null',
  )
  return (value as string | null | undefined) ?? null
}

function parseCorrespondenceSubmission(ctx: Context, body: Record<string, unknown>) {
  if (body.kind === 'appeal') {
    ctx.assert(boundedString(body.appeal_reason, 10_000), 422, 'appeal_reason is required')
    return {
      reason: body.appeal_reason,
      targetIds: parseCopyrightTargetIds(body.target_ids),
      rationale: body.rationale as string,
    }
  }
  if (body.kind === 'counter_notice') {
    ctx.assert(boundedString(body.name, 200), 422, 'name is required')
    ctx.assert(boundedString(body.address, 4096), 422, 'address is required')
    ctx.assert(boundedString(body.telephone, 200), 422, 'telephone is required')
    ctx.assert(
      body.consent_to_federal_jurisdiction === true,
      422,
      'consent_to_federal_jurisdiction must be accepted',
    )
    ctx.assert(
      body.consent_to_service_of_process === true,
      422,
      'consent_to_service_of_process must be accepted',
    )
    ctx.assert(
      body.good_faith_misidentification_under_penalty_of_perjury === true,
      422,
      'good_faith_misidentification_under_penalty_of_perjury must be accepted',
    )
    ctx.assert(
      boundedString(body.electronic_signature, 500),
      422,
      'electronic_signature is required',
    )
    return {
      name: body.name,
      address: body.address,
      telephone: body.telephone,
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: body.electronic_signature,
      targetIds: parseCopyrightTargetIds(body.target_ids),
    }
  }
  ctx.assert(boundedString(body.submission_summary, 10_000), 422, 'submission_summary is required')
  return { summary: body.submission_summary }
}

function parseSimilarityCandidateLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const limit = typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return undefined
  return limit
}

function parseNullableDate(ctx: Context, value: unknown, field: string): Date | null {
  if (value === null || value === undefined) return null
  ctx.assert(typeof value === 'string', 422, `${field} must be an ISO date or null`)
  const parsed = new Date(value)
  ctx.assert(!Number.isNaN(parsed.getTime()), 422, `${field} must be an ISO date or null`)
  return parsed
}

function parseNullableEnum<const T extends readonly string[]>(
  ctx: Context,
  value: unknown,
  allowed: T,
  field: string,
): T[number] | null {
  if (value === null || value === undefined) return null
  ctx.assert(typeof value === 'string' && allowed.includes(value), 422, `${field} is invalid`)
  return value as T[number]
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
