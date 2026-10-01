import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createCopyrightDeliveryIntent,
  createCopyrightEmailIntake,
  createOutboundCopyrightCorrespondence,
  claimCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
  recordCopyrightEmailParse,
  rejectCopyrightEmailIntake,
} from './index.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'

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
  })
})
