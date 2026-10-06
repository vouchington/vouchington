import type { PrivateUser } from '@services/users/types'
import { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import { enqueueSendCopyrightNoticeEmail } from '@queues/emails/enqueues'
import { replayFailedCopyrightEmailIntakeReply } from './email-intake-reply-replay.mts'
import { replayFailedCopyrightDeliveryIntent } from './delivery-intents.mts'
import { rejectCopyrightEmailIntakeDecision } from './copyright-email-decision-actions.mts'
import {
  copyrightMcpDecisionProvenance,
  loadCopyrightMcpEmailIntake,
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
