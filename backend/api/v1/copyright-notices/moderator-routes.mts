import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import {
  assertCopyrightIntakeEnabled,
  currentUserCanReviewCopyrightNotices,
  promoteCopyrightEmailIntake,
  rejectCopyrightEmailIntake,
  resolveCopyrightImagePlacement,
  reviewCopyrightGuestFormIntake,
} from '@services/copyright-notices'
import { boundedString, parseCopyrightNoticeForm } from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'

app.route('/api/v1/copyright-email-intakes/:id/approvals').post(async (ctx: Context) => {
  assertCopyrightIntakeEnabled()
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
  assertCopyrightIntakeEnabled()
  const { currentUser, intakeId, body } = await parseReviewRequest(
    ctx,
    'POST:/api/v1/copyright-form-intakes/:id/reviews',
  )
  ctx.assert(typeof body.accepted === 'boolean', 422, 'accepted must be a boolean')
  const reviewed = await reviewCopyrightGuestFormIntake({
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
  assertCopyrightIntakeEnabled()
  const { currentUser, intakeId, body } = await parseReviewRequest(
    ctx,
    'POST:/api/v1/copyright-email-intakes/:id/rejections',
  )
  await rejectCopyrightEmailIntake({
    currentUser,
    intakeId,
    recommendationId: parseRecommendationId(ctx, body),
    rationale: body.rationale as string,
  })
  ctx.setStatus(204)
})

async function parseReviewRequest(ctx: Context, routeId: string) {
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
