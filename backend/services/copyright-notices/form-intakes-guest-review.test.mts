import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createCopyrightFormIntake, reviewCopyrightFormIntake } from './index.mts'

describe('copyright guest form intake review', () => {
  it('requires and records moderator approval before a guest form restricts a target', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `guest copyright ${crypto.randomUUID()}`,
      slug: `guest-copyright-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightFormIntake({
      requesterUserId: null,
      requesterIdentity: `guest:${crypto.randomUUID()}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Guest claimant',
        claimantContact: 'guest@example.test',
        claimantEmail: 'guest@example.test',
        workDescription: 'Guest-owned photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Guest claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    })

    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: moderator,
      accepted: true,
      rationale: 'Structured fields and hosted target were verified.',
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
  })
})
