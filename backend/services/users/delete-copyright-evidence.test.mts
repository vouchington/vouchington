import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { hardDeleteTestUser, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { hasTestRetainedIdentityRoot } from '@voucha/test-helpers/entities/retained-identities'
import { cleanupRetainedIdentityRoots } from '../data-retention/cleanup-retained-identities.mts'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { readTestCopyrightSurfaceRetainedEvidence } from '@voucha/test-helpers/copyright-surface-retained-evidence'
import { selectCopyrightPlacementPartyUserIds } from '@services/media-delivery-safety/copyright-placement-parties'

describe('deleted copyright surface evidence', () => {
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
      bound_by_user_id: fixture.actorUserId,
      uploaded_by_user_id: fixture.actorUserId,
      bound_by_administrator: null,
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
