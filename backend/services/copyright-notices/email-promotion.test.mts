import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  createCopyrightEmailIntake,
  getCopyrightNoticePrivateAggregate,
  promoteCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from './index.mts'

describe('copyright email promotion', () => {
  it('requires a moderator to promote an email intake before imposing its restrictions', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `Copyright email approval ${crypto.randomUUID()}`,
      slug: `copyright-email-approval-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'Hosted copyright target.',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const sesMessageId = `ses-approved-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 9),
      rawMimeType: 'message/rfc822',
      rawByteSize: 123,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
      subject: 'Copyright complaint',
      bodyText: 'This is a copyright complaint.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    const approved = await promoteCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'The extraction agent was unavailable.',
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
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
      rationale: 'The email contains the statutory notice statements.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(approved.noticeId)
    expect(aggregate?.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: approved.submissionId, source_kind: 'email' }),
      ]),
    )
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([expect.objectContaining({ imposed_by_id: moderator.id })]),
    )
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
      { accepted: true, promoted_copyright_notice_id: approved.noticeId },
    ])
  })
})
