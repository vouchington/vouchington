import { createTestSubmissionGuidanceCounterCase } from './copyright-submission-guidance-disclosure-fixtures.mts'
import { seedDisclosureEmailAdmission } from './copyright-disclosure-email-admission.mts'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '../services/copyright-notices/index.mts'
import { linkCopyrightEmailIntakeToNotice } from './copyright-email-intake-link.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './services/copyright-notices/email-ses-verdicts.mts'
export async function createCommittedDisclosureEmailCounter() {
  const scene = await createTestSubmissionGuidanceCounterCase({
    claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
  })
  const sesMessageId = `guidance-counter-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 7),
    rawMimeType: 'message/rfc822',
    rawByteSize: 128,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `poster-${crypto.randomUUID()}@example.test`,
    subject: 'Counter-notice',
    bodyText: 'Please review my counter-notice.',
    messageId: `<${sesMessageId}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  await linkCopyrightEmailIntakeToNotice({
    intakeId: intake.id,
    noticeId: scene.noticeId,
    linkKind: 'thread',
  })
  const admitted = await seedDisclosureEmailAdmission({
    currentUser: scene.moderator,
    intakeId: intake.id,
    kind: 'counter_notice',
    targetIds: [scene.target.id],
    structuredSubmission: {
      name: 'Poster',
      address: '1 Main Street',
      telephone: '555-0100',
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: 'Poster',
      targetIds: [scene.target.id],
    },
    rationale: 'The required statutory fields are present.',
    recommendationId: null,
    manualFallbackReason: 'The review proceeds without model output.',
  })
  return { ...scene, submissionId: admitted.submissionId }
}
