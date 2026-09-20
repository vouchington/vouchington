import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createCopyrightFormIntake, reviewCopyrightFormIntake } from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'

describe('copyright form moderator fallback', () => {
  it('rescues signed-in forms after an anti-spam false positive or agent outage', async () => {
    const [poster, claimant, moderatorRecord] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `flagged copyright ${crypto.randomUUID()}`,
      slug: `flagged-copyright-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const createNotice = (workDescription: string) =>
      createCopyrightFormIntake({
        requesterUserId: claimant.id,
        requesterIdentity: `user:${claimant.id}`,
        idempotencyKey: crypto.randomUUID(),
        request: {
          jurisdiction: 'us_dmca',
          claimantDisplayName: 'Claimant',
          claimantContact: 'Claimant contact record',
          claimantEmail: 'claimant@example.test',
          workDescription,
          goodFaithBelief: true,
          accuracyAuthorityUnderPenaltyOfPerjury: true,
          electronicSignature: 'Claimant',
          claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
        },
      })
    const flaggedNotice = await createNotice('Original photograph')
    await appendCopyrightFormScreening({
      intakeId: flaggedNotice.intake.id,
      inputSha256: Buffer.alloc(32, 9),
      recommendation: 'invalid_or_spam',
      rationale: 'Potential false positive for staff review.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    })
    await applyNonSpamSignedInCopyrightFormScreening(
      flaggedNotice.intake.copyright_notice_submission_id,
    )
    await expect(
      countCopyrightActiveRestrictionsForNotice(flaggedNotice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await reviewCopyrightFormIntake({
      intakeId: flaggedNotice.intake.id,
      currentUser: moderator,
      accepted: true,
      rationale: 'The anti-spam classification was a false positive.',
    })

    const outageNotice = await createNotice('A second original photograph claim')
    await reviewCopyrightFormIntake({
      intakeId: outageNotice.intake.id,
      currentUser: moderator,
      accepted: true,
      rationale: 'Manual review completed after the screening agent exhausted its retries.',
    })
    await expect(
      Promise.all(
        [flaggedNotice, outageNotice].map(notice =>
          countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
        ),
      ),
    ).resolves.toEqual([1, 1])
  })
})
