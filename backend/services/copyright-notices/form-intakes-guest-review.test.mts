import {
  assertGuestFormApproval,
  readGuestApprovalState,
} from '@voucha/test-helpers/copyright-guest-form-approval-subject'
import { createGuestCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { seedServiceFormDecision } from '@voucha/test-helpers/copyright-service-review-prerequisites'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createCopyrightFormIntake } from './index.mts'

describe('copyright guest form intake review', () => {
  it('requires and records moderator approval before a guest form restricts a target', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const postId = await insertTestPost({
      title: `guest copyright ${crypto.randomUUID()}`,
      slug: `guest-copyright-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightFormIntake({
      currentUser: null,
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
        claimantTargets: [
          {
            surfaceKind: 'post-image' as const,
            postId,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
      },
    })

    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await assertGuestFormApproval(notice, poster.id, {
      currentUser: moderator,
      is_accepted: true,
      rationale: 'Structured fields and hosted target were verified.',
    })
    // The independent committed approval always reaches the positive restriction/read-model guard.
    const committedPoster = await createTestUser()
    const committed = await createGuestCopyrightForm(1, { poster: committedPoster })
    await seedServiceFormDecision({
      intakeId: committed.intake.id,
      currentUser: moderator,
      is_accepted: true,
      rationale: 'Structured fields and hosted target were verified.',
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(committed.intake.copyright_notice_id),
    ).resolves.toBe(1)
    const state = await readGuestApprovalState(committed, committedPoster.id)
    expect(state.reviews).toEqual([
      {
        intake: committed.intake.id,
        reviewer: moderator.id,
        accepted: true,
        rationale: 'Structured fields and hosted target were verified.',
      },
    ])
    expect(state.assessors).toEqual([
      { id: state.state.assessments[0]!.id, by: moderator.id, screening: null },
    ])
    expect(state.physical?.withheld).toBe(false)
  })
})
