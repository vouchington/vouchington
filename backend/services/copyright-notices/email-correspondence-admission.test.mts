import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { decryptSecret } from '@modules/token-secrets'
import {
  admitCopyrightEmailCorrespondence,
  createCopyrightEmailIntake,
  prepareCopyrightEmailDelivery,
  recordCopyrightEmailParse,
  rejectCopyrightEmailCorrespondence,
  reviewCopyrightCounterNotice,
} from './index.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright email correspondence admission', () => {
  it('keeps the original email separate from structured counter-notice fields', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `Copyright correspondence ${crypto.randomUUID()}`,
      slug: `copyright-correspondence-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    const placementId = await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: null,
      claimantDisplayName: null,
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: { kind: 'notice', sourceKind: 'email', bodyCiphertext: 'ciphertext' },
      targets: [
        {
          placementId,
          placementRevision: 1,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const targetId = aggregate?.targets[0]?.id
    if (!targetId) throw new Error('Copyright target was not created')
    const sesMessageId = `ses-counter-${crypto.randomUUID()}`
    const rawBody = 'Attached is my counter-notice with my contact details.'
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 8),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: 'poster@example.test',
      subject: 'Counter-notice',
      bodyText: rawBody,
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: intake.id,
      noticeId: notice.id,
      linkKind: 'thread',
    })
    await expect(readTestPendingCopyrightAgentDispatches(intake.id)).resolves.toEqual([
      { kind: 'email', intakeId: intake.id },
    ])
    const admitted = await admitCopyrightEmailCorrespondence({
      currentUser: moderator,
      intakeId: intake.id,
      kind: 'counter_notice',
      targetIds: [targetId],
      structuredSubmission: {
        name: 'Hosted-material poster',
        address: '1 Main Street, Example City',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Hosted-material poster',
        targetIds: [targetId],
      },
      rationale: 'The statutory fields were verified against the source email.',
      recommendationId: null,
      manualFallbackReason: 'Agent output is unavailable.',
    })
    // A decided email needs no recommendation, so the reconciler must not send it to the model
    // after intake is switched back on.
    await expect(readTestPendingCopyrightAgentDispatches(intake.id)).resolves.toEqual([])
    await expect(
      rejectCopyrightEmailCorrespondence({
        currentUser: moderator,
        intakeId: intake.id,
        kind: 'counter_notice',
        rationale: 'The same email cannot receive a second decision.',
        recommendationId: null,
        manualFallbackReason: 'Agent output is unavailable.',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      admitCopyrightEmailCorrespondence({
        currentUser: moderator,
        intakeId: intake.id,
        kind: 'counter_notice',
        targetIds: [targetId],
        structuredSubmission: {
          name: 'Hosted-material poster',
          address: '1 Main Street, Example City',
          telephone: '555-0100',
          consentToFederalJurisdiction: true,
          consentToServiceOfProcess: true,
          goodFaithMisidentificationUnderPenaltyOfPerjury: true,
          electronicSignature: 'Hosted-material poster',
          targetIds: [targetId],
        },
        rationale: 'The completed correspondence decision may be safely replayed.',
        recommendationId: null,
        manualFallbackReason: 'Agent output is unavailable.',
      }),
    ).resolves.toEqual({ ...admitted, isDuplicate: true })
    const admittedAggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const submission = admittedAggregate?.submissions.find(
      item => item.id === admitted.submissionId,
    )
    const correspondence = admittedAggregate?.correspondence.find(
      item => item.id === admitted.correspondenceId,
    )

    expect(submission).toBeDefined()
    expect(
      JSON.parse(
        decryptSecret(
          submission?.body_ciphertext ?? '',
          copyrightSubmissionPurpose(admitted.submissionId),
        ),
      ),
    ).toEqual(expect.objectContaining({ name: 'Hosted-material poster', targetIds: [targetId] }))
    expect(
      decryptSecret(
        correspondence?.body_ciphertext ?? '',
        copyrightEmailIntakePurpose(sesMessageId),
      ),
    ).toBe(rawBody)

    await reviewCopyrightCounterNotice({
      submissionId: admitted.submissionId,
      currentUser: moderator,
      accepted: false,
      rationale: 'The statutory declarations were not sufficient.',
    })
    const reviewedAggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const outcomeIntent = reviewedAggregate?.deliveryIntents.find(
      intent =>
        intent.copyright_notice_submission_id === admitted.submissionId &&
        intent.delivery_kind === 'status_update' &&
        intent.channel === 'email',
    )
    if (!outcomeIntent) throw new Error('Email counter-notice outcome was not queued')
    await expect(prepareCopyrightEmailDelivery(outcomeIntent.id)).resolves.toMatchObject({
      recipientEmail: 'poster@example.test',
      text: 'Your counter-notice was reviewed and was not accepted.',
    })
  })

  it('replays a rejected matched email without a second decision', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `Copyright reject replay ${crypto.randomUUID()}`,
      slug: `copyright-reject-replay-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    const placementId = await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: null,
      claimantDisplayName: null,
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: { kind: 'notice', sourceKind: 'email', bodyCiphertext: 'ciphertext' },
      targets: [
        {
          placementId,
          placementRevision: 1,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const sesMessageId = `ses-reject-replay-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 6),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: 'poster@example.test',
      subject: 'Counter-notice',
      bodyText: 'This is not my material.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: intake.id,
      noticeId: notice.id,
      linkKind: 'thread',
    })
    await expect(readTestPendingCopyrightAgentDispatches(intake.id)).resolves.toEqual([
      { kind: 'email', intakeId: intake.id },
    ])
    const rejected = await rejectCopyrightEmailCorrespondence({
      currentUser: moderator,
      intakeId: intake.id,
      kind: 'counter_notice',
      rationale: 'The message does not complete a counter-notice.',
      recommendationId: null,
      manualFallbackReason: 'Agent output is unavailable.',
    })
    expect(rejected).toEqual({ noticeId: notice.id, isDuplicate: false })
    await expect(readTestPendingCopyrightAgentDispatches(intake.id)).resolves.toEqual([])
    await expect(
      rejectCopyrightEmailCorrespondence({
        currentUser: moderator,
        intakeId: intake.id,
        kind: 'counter_notice',
        rationale: 'The completed rejection may be safely replayed.',
        recommendationId: null,
        manualFallbackReason: 'Agent output is unavailable.',
      }),
    ).resolves.toEqual({ noticeId: notice.id, isDuplicate: true })
    await expect(
      rejectCopyrightEmailCorrespondence({
        currentUser: moderator,
        intakeId: intake.id,
        kind: 'counter_notice',
        rationale: 'The recommendation does not belong to this intake.',
        recommendationId: '00000000-0000-7000-8000-000000000098',
        manualFallbackReason: null,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
