import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createCopyrightEmailIntake,
  getCopyrightStaffEmailIntake,
  promoteCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from './index.mts'

describe('copyright email intake threading', () => {
  it('does not let an early reply open a separate initial case before its root is linked', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `Copyright early reply ${crypto.randomUUID()}`,
      slug: `copyright-early-reply-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const sesMessageId = `ses-early-reply-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 9),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })
    const rootMessageId = `root-${crypto.randomUUID()}@example.test`
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: `poster-${crypto.randomUUID()}@example.test`,
      subject: 'Re: Copyright notice',
      bodyText: 'This reply arrived before the original message.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [`<${rootMessageId}>`],
      attachments: [],
    })

    await expect(
      promoteCopyrightEmailIntake(makePromotionInput(moderator, intake.id, postId, imageId)),
    ).rejects.toThrow('Unresolved reply email must wait for its root case')

    const rootSesMessageId = `ses-root-${crypto.randomUUID()}`
    const { intake: rootIntake } = await createCopyrightEmailIntake({
      sesMessageId: rootSesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${rootSesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 10),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })
    await recordCopyrightEmailParse(rootIntake, {
      status: 'succeeded',
      fromEmail: 'claimant@example.test',
      subject: 'Copyright notice',
      bodyText: 'The original copyright notice.',
      messageId: `<${rootMessageId}>`,
      replyReferences: [],
      attachments: [],
    })
    const promoted = await promoteCopyrightEmailIntake(
      makePromotionInput(moderator, rootIntake.id, postId, imageId),
    )

    await expect(getCopyrightStaffEmailIntake(intake.id, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: promoted.noticeId },
    })
  })
})

function makePromotionInput(
  currentUser: Awaited<ReturnType<typeof createTestUser>>,
  intakeId: string,
  postId: string,
  imageId: string,
) {
  return {
    currentUser,
    intakeId,
    recommendationId: null,
    manualFallbackReason: 'The agent recommendation is unavailable.',
    jurisdiction: 'us_dmca' as const,
    claimantDisplayName: null,
    claimantContact: 'claimant@example.test',
    claimantEmail: 'claimant@example.test',
    workDescription: 'Original photograph',
    goodFaithBelief: true,
    accuracyAuthorityUnderPenaltyOfPerjury: true,
    electronicSignature: 'Claimant',
    targets: [
      {
        placementKey: `post-image:${postId}:${imageId}`,
        placementRevision: 1,
        imageId,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      },
    ],
    rationale: 'The root email is a complete statutory notice.',
  }
}
