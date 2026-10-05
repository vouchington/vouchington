import { beginTransaction } from '@data-stores/psql'
import { createTestCopyrightImageFixture } from './copyright-surface-target-fixtures.mts'
import { createTestLiftNotice } from './copyright-administrator-lift-fixtures.mts'
import { getTestPrivateUserById } from './entities/users.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './services/copyright-notices/email-ses-verdicts.mts'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '../services/copyright-notices/index.mts'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { linkCopyrightEmailIntakeToNotice } from '../services/copyright-notices/email-threading.mts'
import { createCopyrightPosterNoticesInTransaction } from '../services/copyright-notices/restriction-poster-notices.mts'
import type { CopyrightRestorationCause } from '../services/copyright-notices/statement-of-reasons.mts'

export async function createTestSubmissionGuidanceCounterCase(
  options: { claimantEmail?: string } = {},
) {
  const fixture = await createTestCopyrightImageFixture('post-image')
  const notice = await createTestLiftNotice(
    [fixture],
    options.claimantEmail ? { claimantEmail: options.claimantEmail } : {},
  )
  const poster = await getTestPrivateUserById(fixture.actorUserId)
  if (!poster) throw new Error('Counter-notice poster fixture disappeared')
  return {
    fixture,
    poster,
    ...notice,
    target: notice.targets[0]!,
    restriction: notice.restrictions[0]!,
  }
}

export async function admitTestSubmissionGuidanceEmailCounter() {
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
  const admitted = await admitCopyrightEmailCorrespondence({
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

export async function createTestSubmissionGuidanceRestorationStatement(input: {
  noticeId: string
  targetId: string
  restrictionId: string
  cause: CopyrightRestorationCause
}) {
  await using transaction = await beginTransaction()
  await createCopyrightPosterNoticesInTransaction(
    {
      noticeId: input.noticeId,
      targetId: input.targetId,
      restrictionId: input.restrictionId,
      event: 'restriction_ended',
      restorationCause: input.cause,
      restorationOutcome: 'visible',
    },
    transaction,
  )
  await transaction.commit()
}
