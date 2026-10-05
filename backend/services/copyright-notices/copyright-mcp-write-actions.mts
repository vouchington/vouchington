import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import { enqueueSendCopyrightNoticeEmail } from '@queues/emails/enqueues'
import { assertCopyrightIntakeEnabled } from './activation.mts'
import { parseCopyrightNoticeForm } from './http-input.mts'
import { replayFailedCopyrightEmailIntakeReply } from './email-intake-reply-replay.mts'
import { replayFailedCopyrightDeliveryIntent } from './delivery-intents.mts'
import {
  approveCopyrightEmailIntakeDecision,
  rejectCopyrightEmailIntakeDecision,
} from './copyright-email-decision-actions.mts'
import { resolveCopyrightMcpHostedTarget } from './copyright-mcp-hosted-targets.mts'
import {
  copyrightMcpDecisionProvenance,
  loadCopyrightMcpEmailIntake,
  requireCopyrightMcpRecommendation,
  validateCopyrightMcpConstructedRequest,
} from './copyright-mcp-write-validation.mts'
export {
  admitCopyrightEmailCorrespondenceFromRecommendation,
  rejectCopyrightEmailCorrespondenceFromRecommendation,
} from './copyright-mcp-correspondence.mts'
export {
  parseCopyrightAppealDecisionInput,
  parseCopyrightLegalHoldAssessmentInput,
} from './copyright-mcp-case-input.mts'

export async function approveCopyrightEmailIntakeFromRecommendation(
  currentUser: PrivateUser,
  intakeId: string,
  rationale: string,
) {
  assertCopyrightIntakeEnabled()
  const intake = await loadCopyrightMcpEmailIntake(currentUser, intakeId)
  const recommendation = requireCopyrightMcpRecommendation(intake)
  const output = recommendation.structured_output

  assert(
    Array.isArray(output.target_urls) &&
      output.target_urls.length > 0 &&
      output.target_urls.length <= 20,
    422,
    'target_urls must contain 1 to 20 hosted images',
  )
  const targets = await Promise.all(output.target_urls.map(resolveCopyrightMcpHostedTarget))
  const body = {
    jurisdiction: 'us_dmca',
    claimant_display_name: output.claimant_name ?? null,
    claimant_contact: output.claimant_contact,
    claimant_email: output.claimant_email,
    work_description: output.work_description,
    electronic_signature: output.electronic_signature,
    has_good_faith_belief: output.has_good_faith_belief,
    has_accuracy_authority_under_penalty_of_perjury:
      output.has_accuracy_authority_under_penalty_of_perjury,
    targets,
    rationale,
    recommendation_id: recommendation.id,
  }
  const input = parseCopyrightNoticeForm(body)
  validateCopyrightMcpConstructedRequest(
    '/api/v1/copyright-email-intakes/:id/approvals',
    { id: intakeId },
    body,
  )
  return approveCopyrightEmailIntakeDecision(
    currentUser,
    intakeId,
    input,
    recommendation.id,
    null,
    rationale,
  )
}

export async function rejectCopyrightEmailIntakeFromRecommendation(
  currentUser: PrivateUser,
  intakeId: string,
  rationale: string,
) {
  const intake = await loadCopyrightMcpEmailIntake(currentUser, intakeId)
  const provenance = copyrightMcpDecisionProvenance(intake)
  const body = { rationale, response_kind: 'rejected', ...provenance }
  validateCopyrightMcpConstructedRequest(
    '/api/v1/copyright-email-intakes/:id/rejections',
    { id: intakeId },
    body,
  )
  return rejectCopyrightEmailIntakeDecision({
    currentUser,
    intakeId,
    rationale,
    responseKind: 'rejected',
    responseMessage: null,
    recommendationId: intake.recommendation?.id ?? null,
    manualFallbackReason:
      'manual_fallback_reason' in provenance ? (provenance.manual_fallback_reason ?? null) : null,
  })
}

export async function replayCopyrightEmailIntakeReplyAndEnqueue(
  currentUser: PrivateUser,
  intakeId: string,
) {
  validateCopyrightMcpConstructedRequest('/api/v1/copyright-email-intakes/:id/reply/replays', {
    id: intakeId,
  })
  const intentId = await replayFailedCopyrightEmailIntakeReply({
    currentUser,
    intakeId,
  })
  if (intentId) void enqueueSendCopyrightNoticeEmail(intentId)
  return { replayed: intentId !== null }
}

export async function replayCopyrightDeliveryIntentAndEnqueue(
  currentUser: PrivateUser,
  noticeId: string,
  intentId: string,
) {
  validateCopyrightMcpConstructedRequest(
    '/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
    { id: noticeId, intentId },
  )
  const replayed = await replayFailedCopyrightDeliveryIntent({
    noticeId,
    intentId,
    actorUserId: currentUser.id,
  })
  if (replayed) void enqueueDeliverCopyrightNotice(intentId)
  return { replayed }
}
