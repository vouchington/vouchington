import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
  reviewCopyrightFormIntake,
} from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'

async function expectQueuedRestore(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  expect(aggregate?.actionIntents).toEqual(
    expect.arrayContaining([expect.objectContaining({ action: 'restore', state: 'pending' })]),
  )
}

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
    await expect(
      reviewCopyrightFormIntake({
        intakeId: flaggedNotice.intake.id,
        currentUser: moderator,
        accepted: true,
        rationale: 'The completed moderator decision may be safely replayed.',
      }),
    ).resolves.toMatchObject({
      noticeId: flaggedNotice.intake.copyright_notice_id,
      accepted: true,
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

  it('keeps a moderator rejection authoritative when it races a clean automated screening', async () => {
    const [poster, claimant, moderatorRecord] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `racing copyright ${crypto.randomUUID()}`,
      slug: `racing-copyright-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightFormIntake({
      requesterUserId: claimant.id,
      requesterIdentity: `user:${claimant.id}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'Claimant contact record',
        claimantEmail: 'claimant@example.test',
        workDescription: 'A disputed photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    })
    await appendCopyrightFormScreening({
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 10),
      recommendation: 'not_obviously_invalid',
      rationale: 'No obvious spam markers.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    })

    await Promise.all([
      reviewCopyrightFormIntake({
        intakeId: notice.intake.id,
        currentUser: moderator,
        accepted: false,
        rationale: 'The claimant did not substantiate this complaint.',
      }),
      applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id),
    ])
    const remaining = await countCopyrightActiveRestrictionsForNotice(
      notice.intake.copyright_notice_id,
    )
    if (remaining === 0) return
    expect(remaining).toBe(1)
    await expectQueuedRestore(notice.intake.copyright_notice_id)
  })

  it('lets a moderator reverse an automated signed-in restriction', async () => {
    const [poster, claimant, moderatorRecord] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `reverse copyright ${crypto.randomUUID()}`,
      slug: `reverse-copyright-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightFormIntake({
      requesterUserId: claimant.id,
      requesterIdentity: `user:${claimant.id}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'Claimant contact record',
        claimantEmail: 'claimant@example.test',
        workDescription: 'A disputed photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    })
    await appendCopyrightFormScreening({
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 11),
      recommendation: 'not_obviously_invalid',
      rationale: 'No obvious spam markers.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    })
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: moderator,
      accepted: false,
      rationale: 'The automated restriction was not substantiated.',
    })
    await expectQueuedRestore(notice.intake.copyright_notice_id)
  })

  it('replays concurrent guest-form rejections onto one human assessment', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `guest race ${crypto.randomUUID()}`,
      slug: `guest-race-${crypto.randomUUID()}`,
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
    const reviews = await Promise.all([
      reviewCopyrightFormIntake({
        intakeId: notice.intake.id,
        currentUser: moderator,
        accepted: false,
        rationale: 'The guest complaint was not substantiated.',
      }),
      reviewCopyrightFormIntake({
        intakeId: notice.intake.id,
        currentUser: moderator,
        accepted: false,
        rationale: 'The completed moderator decision may be safely replayed.',
      }),
    ])
    expect(reviews[0]).toEqual(reviews[1])
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
  })
})
