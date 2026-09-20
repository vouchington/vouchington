import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createProfileLink, deleteProfileLink } from './profile-links.mts'
import { updateProfileImageId } from './identity.mts'
import {
  getImagePlacementDeliveryKey,
  getLegacyImageDeliveryKey,
  stageImagePlacementDeliveryRecord,
  stageAllCurrentImagePlacementDeliveryRecords,
} from '@services/media-delivery-safety'
import {
  createTestUserDirect,
  completeTestMediaDeliveryRecord,
  getTestImageSurfacePlacements,
  getTestMediaDeliveryRecord,
  hardDeleteTestUser,
  insertTestCommunity,
  insertTestImage,
  insertTestTopic,
  isTestImagePlacementPubliclyProjected,
  mergeTopicForTest,
  setTestCommunitySurfaceImages,
  setTestImageCreator,
  setTestTopicSurfaceImages,
  softDeleteTopic,
  softDeleteUser,
  restoreTestImageSurfacePlacementsAfterImageDeletion,
  retireTestImageSurfacePlacementsForDeletedImage,
} from '@voucha/test-helpers'

describe('image surface placement lifecycle', () => {
  it('retires profile surfaces on soft deletion and hands their historical owner off before purge', async () => {
    const user = await createTestUserDirect()
    const archiveOwner = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await updateProfileImageId(user.id, imageId)

    await softDeleteUser(user.id)
    const [softDeleted] = await getTestImageSurfacePlacements({ userId: user.id })
    expect(softDeleted).toMatchObject({ image_id: imageId, retired_at: expect.any(Date) })

    // A real purge cascades images owned by the user. Transfer this fixture's byte asset so the
    // test isolates the placement's historical-owner handoff from image-retention policy.
    await setTestImageCreator(imageId, archiveOwner.id)
    await hardDeleteTestUser(user.id)
    const [purged] = await getTestImageSurfacePlacements({ imageId })
    expect(purged).toMatchObject({
      image_id: imageId,
      retired_user_id: user.id,
      retired_at: expect.any(Date),
    })
  })

  it('retires topic and community surfaces when their parent becomes unavailable', async () => {
    const owner = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Surface topic ${suffix}`,
      slug: `surface-topic-${suffix}`,
      createdById: owner.id,
    })
    const destinationId = await insertTestTopic({
      name: `Surface destination ${suffix}`,
      slug: `surface-destination-${suffix}`,
      createdById: owner.id,
    })
    const topicImageId = await insertTestImage(owner.id)
    await setTestTopicSurfaceImages(topicId, { logoImageId: topicImageId })
    await mergeTopicForTest(topicId, destinationId, owner.id)
    const [merged] = await getTestImageSurfacePlacements({ topicId })
    expect(merged?.retired_at).toBeInstanceOf(Date)

    const community = await insertTestCommunity({ createdById: owner.id })
    const communityImageId = await insertTestImage(owner.id)
    await setTestCommunitySurfaceImages(community.id, { profileImageId: communityImageId })
    await setTestCommunitySurfaceImages(community.id, { deleted: true })
    const [deleted] = await getTestImageSurfacePlacements({ communityId: community.id })
    expect(deleted).toMatchObject({ image_id: communityImageId, retired_at: expect.any(Date) })

    await softDeleteTopic(destinationId, owner.id)
  })

  it('retires a profile-link surface before deleting its parent row', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const link = await createProfileLink(user.id, {
      link_type: 'github',
      handle: `surface-${randomUUID().slice(0, 8)}`,
      image_id: imageId,
    })

    await deleteProfileLink(user.id, link.id)
    const [placement] = await getTestImageSurfacePlacements({ imageId })
    expect(placement).toMatchObject({
      retired_user_profile_link_id: link.id,
      retired_at: expect.any(Date),
    })
  })

  it('keeps one active profile binding and stages both old exact and generic routes withheld on replacement', async () => {
    const user = await createTestUserDirect()
    const oldImageId = await insertTestImage(user.id)
    const newImageId = await insertTestImage(user.id)
    await updateProfileImageId(user.id, oldImageId)
    const [oldPlacement] = await getTestImageSurfacePlacements({ userId: user.id })
    expect(oldPlacement).toBeDefined()

    await updateProfileImageId(user.id, newImageId)
    const placements = await getTestImageSurfacePlacements({ userId: user.id })
    expect(placements.filter(placement => placement.retired_at === null)).toHaveLength(1)
    expect(await getTestMediaDeliveryRecord(getLegacyImageDeliveryKey(oldImageId))).toMatchObject({
      desired_state: 'withheld',
    })
    expect(
      await getTestMediaDeliveryRecord(
        getImagePlacementDeliveryKey({
          placementId: oldPlacement!.placement_id,
          revision: oldPlacement!.placement_revision,
          imageId: oldImageId,
        }),
      ),
    ).toMatchObject({ desired_state: 'withheld' })
    expect(await getTestMediaDeliveryRecord(getLegacyImageDeliveryKey(newImageId))).toMatchObject({
      desired_state: 'withheld',
    })
  })

  it('keeps a profile use retired when its owner removes it during image-delete rollback', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await updateProfileImageId(user.id, imageId)
    const [initial] = await getTestImageSurfacePlacements({ userId: user.id })
    expect(initial).toBeDefined()

    const retired = await retireTestImageSurfacePlacementsForDeletedImage(imageId)
    expect(retired).toEqual([
      { placementId: initial!.placement_id, revision: initial!.placement_revision + 1 },
    ])

    await updateProfileImageId(user.id, null)

    await restoreTestImageSurfacePlacementsAfterImageDeletion(retired)

    await expect(getTestImageSurfacePlacements({ userId: user.id })).resolves.toMatchObject([
      {
        placement_id: initial!.placement_id,
        placement_revision: initial!.placement_revision + 2,
        retired_at: expect.any(Date),
        retirement_reason: 'owner_removed',
      },
    ])
  })

  it('projects only completed allow tuples and hides withheld tuples immediately', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    await updateProfileImageId(user.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
    expect(placement).toBeDefined()
    const deliveryKey = getImagePlacementDeliveryKey({
      placementId: placement!.placement_id,
      revision: placement!.placement_revision,
      imageId,
    })

    expect(
      await isTestImagePlacementPubliclyProjected({
        placementId: placement!.placement_id,
        revision: placement!.placement_revision,
        imageId,
      }),
    ).toBe(false)

    await stageAllCurrentImagePlacementDeliveryRecords()
    expect(await getTestMediaDeliveryRecord(deliveryKey)).toMatchObject({ desired_state: 'allow' })
    expect(await getTestMediaDeliveryRecord(getLegacyImageDeliveryKey(imageId))).toMatchObject({
      desired_state: 'withheld',
    })
    expect(
      await isTestImagePlacementPubliclyProjected({
        placementId: placement!.placement_id,
        revision: placement!.placement_revision,
        imageId,
      }),
    ).toBe(false)

    await completeTestMediaDeliveryRecord(deliveryKey)
    expect(
      await isTestImagePlacementPubliclyProjected({
        placementId: placement!.placement_id,
        revision: placement!.placement_revision,
        imageId,
      }),
    ).toBe(true)

    await stageImagePlacementDeliveryRecord({
      placementId: placement!.placement_id,
      revision: placement!.placement_revision,
      imageId,
      state: 'withheld',
    })
    expect(
      await isTestImagePlacementPubliclyProjected({
        placementId: placement!.placement_id,
        revision: placement!.placement_revision,
        imageId,
      }),
    ).toBe(false)
  })
})
