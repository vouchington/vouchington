import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createCopyrightEmailIntake,
  markCopyrightDeliveryIntentSent,
  recordCopyrightEmailParse,
} from './index.mts'
import { getCopyrightStaffEmailIntake } from './read-models.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import { createOutboundCopyrightCorrespondence } from './correspondence.mts'
import { claimCopyrightDeliveryIntent, createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { promoteInitialCopyrightEmail } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'

describe('copyright email threading', () => {
  it('links a reply to a sent outbound copyright email to its case for human review', async () => {
    const [moderatorRecord, poster] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `Copyright outbound thread ${crypto.randomUUID()}`,
      slug: `copyright-outbound-thread-${crypto.randomUUID()}`,
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
    const correspondence = await createOutboundCopyrightCorrespondence({
      noticeId: notice.id,
      submissionId: null,
      correspondenceKind: 'status_update',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `body-${crypto.randomUUID()}`,
      draftedById: null,
    })
    const intent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'status_update',
      channel: 'email',
      idempotencyKey: `outbound-thread-${crypto.randomUUID()}`,
      recipientEmail: `claimant-${crypto.randomUUID()}@example.test`,
    })
    const outboundMessageId = `ses-outbound-${crypto.randomUUID()}`
    const claim = await claimCopyrightDeliveryIntent(intent.id)
    expect(claim?.state).toBe('claimed')
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: intent.id,
        leaseToken: claim!.lease_token,
        sesMessageId: outboundMessageId,
      }),
    ).toBe(true)
    const sesMessageId = `ses-inbound-${crypto.randomUUID()}`
    const inboundMessageId = `<${crypto.randomUUID()}@example.test>`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 7),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })

    await expect(
      recordCopyrightEmailParse(intake, {
        status: 'succeeded',
        fromEmail: 'claimant@example.test',
        subject: 'Re: Copyright notice',
        bodyText: 'Please provide more details.',
        messageId: inboundMessageId,
        replyReferences: [`<${outboundMessageId}>`],
        attachments: [],
      }),
    ).resolves.toEqual({
      noticeId: notice.id,
      matchedIntakeId: null,
      matchedReference: outboundMessageId,
    })
    await expect(
      rejectCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: null,
        manualFallbackReason: 'The extraction agent was unavailable.',
        rationale: 'This is correspondence, not a new notice.',
      }),
    ).rejects.toThrow('Thread-linked copyright email cannot be rejected as an initial intake')

    const replySesMessageId = `ses-inbound-reply-${crypto.randomUUID()}`
    const { intake: reply } = await createCopyrightEmailIntake({
      sesMessageId: replySesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${replySesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 8),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await expect(
      recordCopyrightEmailParse(reply, {
        status: 'succeeded',
        fromEmail: 'claimant@example.test',
        subject: 'Re: Copyright notice',
        bodyText: 'This follows up on the prior correspondence.',
        messageId: `<${crypto.randomUUID()}@example.test>`,
        replyReferences: [inboundMessageId],
        attachments: [],
      }),
    ).resolves.toMatchObject({
      noticeId: notice.id,
      matchedIntakeId: intake.id,
      matchedReference: inboundMessageId.slice(1, -1),
    })

    const waitingMessageId = `<${crypto.randomUUID()}@example.test>`
    const waitingSesMessageId = `ses-inbound-waiting-${crypto.randomUUID()}`
    const { intake: waiting } = await createCopyrightEmailIntake({
      sesMessageId: waitingSesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${waitingSesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 9),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(waiting, {
      status: 'succeeded',
      fromEmail: 'claimant@example.test',
      subject: 'Copyright notice',
      bodyText: 'This notice is not a case yet.',
      messageId: waitingMessageId,
      replyReferences: [],
      attachments: [],
    })
    const mixedSesMessageId = `ses-inbound-mixed-${crypto.randomUUID()}`
    const { intake: mixed } = await createCopyrightEmailIntake({
      sesMessageId: mixedSesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${mixedSesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 6),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await expect(
      recordCopyrightEmailParse(mixed, {
        status: 'succeeded',
        fromEmail: 'claimant@example.test',
        subject: 'Re: Copyright notice',
        bodyText: 'This names both the sent mail and a notice that is not a case yet.',
        messageId: `<${crypto.randomUUID()}@example.test>`,
        replyReferences: [`<${outboundMessageId}>`, waitingMessageId],
        attachments: [],
      }),
    ).resolves.toBeNull()
    await expect(getCopyrightStaffEmailIntake(mixed.id, moderator)).resolves.toMatchObject({
      review_path: 'unresolved_thread',
      linked_notice: null,
    })

    const messageA = `<${crypto.randomUUID()}@example.test>`
    const messageB = `<${crypto.randomUUID()}@example.test>`
    const replyCSesMessageId = `ses-chain-c-${crypto.randomUUID()}`
    const { intake: replyC } = await createCopyrightEmailIntake({
      sesMessageId: replyCSesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${replyCSesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 5),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(replyC, {
      status: 'succeeded',
      fromEmail: 'claimant@example.test',
      subject: 'Re: Copyright notice',
      bodyText: 'This arrived before the message it answers.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [messageB],
      attachments: [],
    })
    const replyBSesMessageId = `ses-chain-b-${crypto.randomUUID()}`
    const { intake: replyB } = await createCopyrightEmailIntake({
      sesMessageId: replyBSesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${replyBSesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 4),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await expect(
      recordCopyrightEmailParse(replyB, {
        status: 'succeeded',
        fromEmail: 'claimant@example.test',
        subject: 'Re: Copyright notice',
        bodyText: 'This answers the sent mail and names a notice that is not a case yet.',
        messageId: messageB,
        replyReferences: [`<${outboundMessageId}>`, messageA],
        attachments: [],
      }),
    ).resolves.toMatchObject({ noticeId: notice.id })
    const promoter = await createTestUser({ extraRoles: ['moderator'] })
    const promotedA = await promoteInitialCopyrightEmail({
      moderator: promoter,
      messageId: messageA,
    })

    await expect(getCopyrightStaffEmailIntake(replyB.id, promoter)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: notice.id },
    })
    await expect(getCopyrightStaffEmailIntake(replyC.id, promoter)).resolves.toMatchObject({
      review_path: 'ancestor_notice_conflict',
      linked_notice: null,
    })
    expect(promotedA.noticeId).not.toBe(notice.id)
  })
})
