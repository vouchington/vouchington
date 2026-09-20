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
  createCopyrightNoticeAggregate,
  createOutboundCopyrightCorrespondence,
  claimCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
  recordCopyrightEmailParse,
  rejectCopyrightEmailIntake,
} from './index.mts'

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
    await insertTestPostImage({ postId, imageId })
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
          placementKey: `post-image:${postId}:${imageId}`,
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
    expect((await claimCopyrightDeliveryIntent(intent.id))?.state).toBe('claimed')
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: intent.id,
        sesMessageId: outboundMessageId,
      }),
    ).toBe(true)
    const sesMessageId = `ses-inbound-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 7),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })

    await expect(
      recordCopyrightEmailParse(intake, {
        status: 'succeeded',
        fromEmail: 'claimant@example.test',
        subject: 'Re: Copyright notice',
        bodyText: 'Please provide more details.',
        messageId: `<${crypto.randomUUID()}@example.test>`,
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
  })
})
