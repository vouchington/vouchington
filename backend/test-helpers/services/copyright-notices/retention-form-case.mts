import { randomBytes, randomUUID } from 'node:crypto'
import {
  admitCopyrightEmailCorrespondence,
  appendCopyrightLegalHoldAssessment,
  copyrightAppealRecommendations,
  createCopyrightCounterNotice,
  createCopyrightDeliveryIntent,
  createOutboundCopyrightCorrespondence,
  markCopyrightDeliveryIntentFailed,
  resolveCopyrightLegalHold,
  reviewCopyrightAppeal,
  reviewCopyrightCounterNotice,
} from '../../../services/copyright-notices/index.mts'
import { claimCopyrightDeliveryIntent } from '../../../services/copyright-notices/delivery-intents.mts'
import { linkCopyrightEmailIntakeToNotice } from '../../../services/copyright-notices/email-threading.mts'
import { insertEncryptedCopyrightHoldSubmission } from '../../data-stores/psql/copyright-hold-submission.mts'
import { insertCopyrightEvidenceArtifact } from '../../data-stores/psql/copyright-evidence-artifacts.mts'
import {
  createTestCopyrightFormIntakeReview,
  liftTestCopyrightRestriction,
} from '../../data-stores/psql/copyright-form-reviews.mts'
import {
  failTestCopyrightDeliveryIntent,
  readCopyrightNoticeTargetId,
} from '../../data-stores/psql/copyright-notice-reads.mts'
import { cancelCopyrightDeadline } from '../../data-stores/psql/copyright-review-target.mts'
import { createTestUser } from '../../index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'
import { sendAllCopyrightDeliveries } from './retention-deliveries.mts'
import { createRetentionParsedEmail, type RetentionCase } from './retention-parsed-email.mts'
import { reviewRetentionRestriction } from './retention-restriction-review.mts'
import { createRetentionSignedInForm } from './retention-signed-in-form.mts'

/**
 * A signed-in form case that has been through every stage the sweep erases: a screening, a staff
 * form review, a confirmed restriction, a stored artifact, a delivered receipt, an accepted
 * counter-notice whose restoration deadline was cancelled, a resolved court hold, and an appeal.
 * Nothing is left open, so only the retention clock keeps it from the sweep. Needs
 * `useAutomaticProvisionalWithholding()` in the calling test so the screening restricts the target.
 */
export async function createRetentionFormCase(): Promise<RetentionCase> {
  const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as PrivateUser
  const intake = await createRetentionSignedInForm(poster.id)
  const noticeId = intake.copyright_notice_id
  const submissionId = intake.copyright_notice_submission_id
  await createTestCopyrightFormIntakeReview({
    intakeId: intake.id,
    moderatorId: moderator.id,
    is_accepted: true,
  })
  await reviewRetentionRestriction({ noticeId, posterId: poster.id, moderator })
  const artifactKey = `copyright-inbound/${randomUUID()}.pdf`
  await insertCopyrightEvidenceArtifact({
    submissionId,
    storageKey: artifactKey,
    sha256: randomBytes(32),
    mimeType: 'application/pdf',
    byteSize: 20,
  })
  const receipt = await createOutboundCopyrightCorrespondence({
    noticeId,
    submissionId,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${randomUUID()}`,
    draftedById: null,
  })
  await createCopyrightDeliveryIntent({
    noticeId,
    submissionId,
    correspondenceId: receipt.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `retention-receipt-${randomUUID()}`,
    recipientEmail: `claimant-${randomUUID()}@example.test`,
  })
  // A status update that ran out of attempts keeps its encrypted failure text, which the sweep
  // erases. A failed delivery is finished, so unlike a pending one it does not hold the case.
  const refused = await createCopyrightDeliveryIntent({
    noticeId,
    submissionId: null,
    correspondenceId: null,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'status_update',
    channel: 'in_app',
    idempotencyKey: `retention-refused-${randomUUID()}`,
  })
  const attempt = await claimCopyrightDeliveryIntent(refused.id)
  if (!attempt) throw new Error('fixture delivery could not be claimed')
  await markCopyrightDeliveryIntentFailed({
    intentId: refused.id,
    leaseToken: attempt.lease_token,
    error: `Delivery refused ${randomUUID()}`,
  })
  await failTestCopyrightDeliveryIntent(refused.id)
  const targetId = await readCopyrightNoticeTargetId(noticeId)
  const holdSubmissionId = await insertEncryptedCopyrightHoldSubmission(noticeId)
  const hold = await appendCopyrightLegalHoldAssessment({
    currentUser: moderator,
    submissionId: holdSubmissionId,
    assessedAt: new Date(),
    fromOriginalClaimant: true,
    proceedingKind: 'ccb',
    ccbClaimKind: 'claim',
    commencedAt: new Date(),
    receivedByDesignatedAgentAt: new Date(),
    sameMaterial: true,
    targetIds: [targetId],
    rationale: `Verified filing ${randomUUID()}.`,
  })
  await resolveCopyrightLegalHold({
    currentUser: moderator,
    assessmentId: hold.id,
    resolvedAt: new Date(),
    resolutionKind: 'dismissed',
    rationale: `Proceeding dismissed ${randomUUID()}.`,
  })
  const counterNotice = await createCopyrightCounterNotice(
    poster as PrivateUser,
    noticeId,
    randomUUID(),
    {
      name: 'Poster Name',
      address: `${randomUUID()} Main Street`,
      telephone: '555-0100',
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: 'Poster Name',
      targetIds: [targetId],
    },
  )
  const counterReview = await reviewCopyrightCounterNotice({
    submissionId: counterNotice.submission.id,
    currentUser: moderator,
    is_accepted: true,
    rationale: `The counter-notice is formally complete ${randomUUID()}.`,
  })
  if (!counterReview.deadlineId) throw new Error('fixture counter-notice deadline missing')
  await cancelCopyrightDeadline(counterReview.deadlineId)
  const appealIntake = await createRetentionParsedEmail('appeal', { reply: true })
  await linkCopyrightEmailIntakeToNotice({
    intakeId: appealIntake.id,
    noticeId,
    linkKind: 'thread',
    matchedReference: `<${randomUUID()}@example.test>`,
  })
  const admitted = await admitCopyrightEmailCorrespondence({
    currentUser: moderator,
    intakeId: appealIntake.id,
    kind: 'appeal',
    targetIds: [targetId],
    structuredSubmission: { reason: `I made this ${randomUUID()}.`, targetIds: [targetId] },
    rationale: `The email completes an appeal ${randomUUID()}.`,
    recommendationId: null,
    manualFallbackReason: 'Agent output is unavailable.',
  })
  await copyrightAppealRecommendations.append({
    submissionId: admitted.submissionId,
    inputSha256: randomBytes(32),
    promptVersion: 'test-v1',
    model: 'test-model',
    recommendation: 'reverse',
    rationale: `The appeal is well founded ${randomUUID()}.`,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const restriction = aggregate?.restrictions[0]
  const recommendation = aggregate?.appealRecommendations[0]
  if (!restriction || !recommendation) throw new Error('fixture appeal rows missing')
  await reviewCopyrightAppeal({
    submissionId: admitted.submissionId,
    currentUser: moderator,
    recommendationId: recommendation.id,
    manualFallbackReason: null,
    rationale: `The record supports reversal ${randomUUID()}.`,
    decisions: [{ restrictionId: restriction.id, action: 'reverse' }],
  })
  // The restore action runs in a worker; lifting here stands in for it finishing.
  await liftTestCopyrightRestriction(restriction.id)
  await sendAllCopyrightDeliveries(noticeId)
  return {
    noticeId,
    moderator,
    posterId: poster.id,
    evidenceKeys: [artifactKey, appealIntake.raw_storage_key],
  }
}
