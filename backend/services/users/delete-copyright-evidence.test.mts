import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  confirmTestRepeatInfringerNotice,
  getTestCopyrightRepeatInfringerReview,
} from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { hardDeleteTestUser, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { hasTestRetainedIdentityRoot } from '@voucha/test-helpers/entities/retained-identities'
import { cleanupRetainedIdentityRoots } from '../data-retention/cleanup-retained-identities.mts'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { readTestCopyrightSurfaceRetainedEvidence } from '@voucha/test-helpers/copyright-surface-retained-evidence'
import { selectCopyrightPlacementPartyUserIds } from '@services/media-delivery-safety/copyright-placement-parties'
import { getCopyrightRepeatInfringerAccount } from '../copyright-notices/repeat-infringer-incidents.mts'
import { recordCopyrightRepeatInfringerReviewOutcome } from '../copyright-notices/index.mts'

describe('deleted copyright surface evidence', () => {
  it('keeps repeat-infringer incidents, reviews, and case evidence after account deletion', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const noticeIds = [
      await confirmTestRepeatInfringerNotice(poster.id, moderator, 'deletion retention'),
      await confirmTestRepeatInfringerNotice(poster.id, moderator, 'deletion retention'),
    ]
    const casesBefore = await Promise.all(noticeIds.map(readRetainedCopyrightCase))
    const openAccount = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(openAccount.incidents).toHaveLength(2)
    const reviewId = openAccount.open_review_id
    if (!reviewId) throw new Error('repeat-infringer review disappeared')
    const outcomeAt = new Date('2026-07-04T12:00:00.000Z')
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: moderator,
      reviewId,
      outcome: 'warning',
      rationale: 'The retained incidents warrant a warning.',
      recordedAt: outcomeAt,
    })
    const reviewBefore = await getTestCopyrightRepeatInfringerReview(reviewId)
    expect(reviewBefore).toMatchObject({
      id: reviewId,
      opened_at: expect.any(Date),
      outcome: 'warning',
      outcome_at: outcomeAt,
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
    const repeatInfringerBefore = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(repeatInfringerBefore.open_review_id).toBeNull()

    await deleteUserAndDrainForTest(poster, poster)
    await hardDeleteTestUser(poster.id)
    await cleanupRetainedIdentityRoots(1_000, { user: [poster.id] })

    await expect(getTestPrivateUserById(poster.id)).resolves.toBeNull()
    await expect(hasTestRetainedIdentityRoot('user', poster.id)).resolves.toBe(true)
    await expect(getCopyrightRepeatInfringerAccount(poster.id)).resolves.toEqual(
      repeatInfringerBefore,
    )
    await expect(getTestCopyrightRepeatInfringerReview(reviewId)).resolves.toEqual(reviewBefore)
    await expect(Promise.all(noticeIds.map(readRetainedCopyrightCase))).resolves.toEqual(
      casesBefore,
    )
  })

  it('retains profile-link uploader, setter, owner, and notice target evidence without authorizing the deleted user', async () => {
    const fixture = await createTestCopyrightImageFixture('user-profile-link-image', {
      actorWithEmail: true,
    })
    const notice = await createTestCopyrightRestrictionForImage(fixture)
    const before = await readTestCopyrightSurfaceRetainedEvidence(notice.targetId)
    expect(before).not.toBeNull()
    expect(before).toMatchObject({
      placement_id: fixture.placementId,
      placement_revision: fixture.placementRevision,
      surface_activation_revision: fixture.placementRevision,
      surface_owner_user_id: fixture.actorUserId,
      activation_placement_id: fixture.placementId,
      activation_revision: fixture.placementRevision,
      bound_by_id: fixture.actorUserId,
      uploaded_by_id: fixture.actorUserId,
      is_bound_by_administrator: null,
    })

    const user = await getTestPrivateUserById(fixture.actorUserId)
    expect(user).not.toBeNull()
    if (!user) throw new Error('Expected live copyright surface owner')
    await deleteUserAndDrainForTest(user, user)
    expect(await getTestPrivateUserById(fixture.actorUserId)).toBeNull()
    await hardDeleteTestUser(fixture.actorUserId)
    await cleanupRetainedIdentityRoots(1_000, { user: [fixture.actorUserId] })

    expect(await hasTestRetainedIdentityRoot('user', fixture.actorUserId)).toBe(true)
    expect(await readTestCopyrightSurfaceRetainedEvidence(notice.targetId)).toEqual(before)
    expect(await selectCopyrightPlacementPartyUserIds(notice.targetId, 'respond')).toEqual([])
    expect(await selectCopyrightPlacementPartyUserIds(notice.targetId, 'strike')).toEqual([])
    expect(await selectCopyrightPlacementPartyUserIds(notice.targetId, 'retain')).toContain(
      fixture.actorUserId,
    )
  })
})

async function readRetainedCopyrightCase(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Copyright case disappeared')
  return {
    notice: aggregate.notice,
    submissions: aggregate.submissions,
    evidenceArtifacts: aggregate.evidenceArtifacts,
  }
}
