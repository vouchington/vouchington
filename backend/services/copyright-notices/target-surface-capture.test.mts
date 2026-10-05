import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestCommunityMember } from '@voucha/test-helpers/entities/community-members'
import { getTestImageSurfacePlacements } from '@voucha/test-helpers/entities/image-surface-placements'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { reactivateTestCommunityImageWithoutBinder } from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { updateCommunity } from '@services/communities/update'
import { readTestCopyrightSurfaceRetainedEvidence } from '@voucha/test-helpers/copyright-surface-retained-evidence'
import { selectCopyrightPlacementPartyUserIds } from '@services/media-delivery-safety/copyright-placement-parties'

describe('copyright target surface activation capture', () => {
  it('keeps a target on its exact setter epoch and captures trigger-only reactivation as unknown', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image')
    const originalNotice = await createTestCopyrightRestrictionForImage(fixture)
    const originalEvidence = await readTestCopyrightSurfaceRetainedEvidence(originalNotice.targetId)
    expect(originalEvidence).toMatchObject({
      surface_activation_revision: fixture.placementRevision,
      bound_by_id: fixture.actorUserId,
      is_bound_by_administrator: false,
    })

    const replacementSetter = await createTestUserDirect()
    const membership = await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: replacementSetter.id,
      role: 'owner',
    })
    await updateCommunity(replacementSetter, fixture.ownerId, { banner_image_id: null }, membership)
    await updateCommunity(
      replacementSetter,
      fixture.ownerId,
      { banner_image_id: fixture.imageId },
      membership,
    )
    const reboundPlacementRevision = (
      await getTestImageSurfacePlacements({
        communityId: fixture.ownerId,
        surfaceKind: 'community-banner-image',
      })
    ).find(placement => placement.retired_at === null)?.placement_revision
    expect(reboundPlacementRevision).toBeDefined()
    expect(reboundPlacementRevision!).toBeGreaterThan(fixture.placementRevision)

    const reboundNotice = await createTestCopyrightRestrictionForImage(fixture)
    const reboundEvidence = await readTestCopyrightSurfaceRetainedEvidence(reboundNotice.targetId)
    expect(reboundEvidence).toMatchObject({
      surface_activation_revision: reboundPlacementRevision!,
      activation_revision: reboundPlacementRevision!,
      bound_by_id: replacementSetter.id,
      is_bound_by_administrator: false,
    })
    expect(await readTestCopyrightSurfaceRetainedEvidence(originalNotice.targetId)).toEqual(
      originalEvidence,
    )
    expect(await selectCopyrightPlacementPartyUserIds(originalNotice.targetId, 'respond')).toEqual([
      fixture.actorUserId,
    ])
    expect(await selectCopyrightPlacementPartyUserIds(reboundNotice.targetId, 'respond')).toEqual([
      replacementSetter.id,
    ])

    const triggerOnlyPlacement = await reactivateTestCommunityImageWithoutBinder(fixture)
    expect(triggerOnlyPlacement.placement_revision).toBeGreaterThan(reboundPlacementRevision!)
    const unknownNotice = await createTestCopyrightRestrictionForImage(fixture)
    const unknownEvidence = await readTestCopyrightSurfaceRetainedEvidence(unknownNotice.targetId)
    expect(unknownEvidence).toMatchObject({
      surface_activation_revision: triggerOnlyPlacement.placement_revision,
      activation_placement_id: null,
      activation_revision: null,
      bound_by_id: null,
      uploaded_by_id: null,
      is_bound_by_administrator: null,
    })
    expect(await selectCopyrightPlacementPartyUserIds(unknownNotice.targetId, 'respond')).toEqual(
      [],
    )
    expect(await selectCopyrightPlacementPartyUserIds(originalNotice.targetId, 'respond')).toEqual([
      fixture.actorUserId,
    ])
  })
})
