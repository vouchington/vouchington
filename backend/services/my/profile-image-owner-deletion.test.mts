import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestImageSurfacePlacements,
  hardDeleteTestUser,
  insertTestImage,
} from '@voucha/test-helpers'
import {
  clearTestActiveImageSurfaceOwner,
  deleteTestImageProfileLink,
  insertTestOwnerlessImageSurface,
  reactivateTestOwnerlessImageSurface,
  readTestImageSurfaceOwner,
  testImageSurfaceDeliveryIsAuthorized,
  changeTestOwnerlessImageSurfaceRetirementReason,
  retireTestImageSurfaceOwner,
  clearTestImageSurfaceOwnerInTransaction,
  reactivateTestImageSurfaceInTransaction,
} from '@voucha/test-helpers/entities/image-surface-owner-deletion'
import { createProfileLink } from './profile-links.mts'

async function createSurface() {
  const [user, imageOwner] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
  const imageId = await insertTestImage(imageOwner.id)
  const link = await createProfileLink(user.id, {
    link_type: 'github',
    handle: `owner-${crypto.randomUUID()}`,
    image_id: imageId,
  })
  const [placement] = await getTestImageSurfacePlacements({ profileLinkId: link.id })
  if (!placement) throw new Error('Expected profile-link placement')
  return { user, imageId, link, placement }
}

describe('terminal image surface owner deletion', () => {
  it('retires and clears the live owner on direct profile-link deletion', async () => {
    const { link, placement } = await createSurface()
    await expect(testImageSurfaceDeliveryIsAuthorized(placement)).resolves.toBe(true)
    await deleteTestImageProfileLink(link.id)
    await expect(readTestImageSurfaceOwner(placement.placement_id)).resolves.toMatchObject({
      user_profile_link_id: null,
      retired_at: expect.any(Date),
      retirement_reason: 'owner_removed',
    })
    await expect(reactivateTestOwnerlessImageSurface(placement.placement_id)).rejects.toThrow(
      'ownerless image surface must remain retired for owner removal',
    )
    await expect(testImageSurfaceDeliveryIsAuthorized(placement)).resolves.toBe(false)
    await expect(
      changeTestOwnerlessImageSurfaceRetirementReason(placement.placement_id),
    ).rejects.toThrow('ownerless image surface must remain retired for owner removal')
  })
  it('retires profile-link bindings during user deletion cascade', async () => {
    const { user, placement } = await createSurface()
    await hardDeleteTestUser(user.id)
    await expect(readTestImageSurfaceOwner(placement.placement_id)).resolves.toMatchObject({
      user_profile_link_id: null,
      retired_at: expect.any(Date),
      retirement_reason: 'owner_removed',
    })
  })
  it('rolls back owner deletion and its placement retirement together', async () => {
    const { link, placement } = await createSurface()
    await deleteTestImageProfileLink(link.id, true)
    await expect(readTestImageSurfaceOwner(placement.placement_id)).resolves.toMatchObject({
      user_profile_link_id: link.id,
      retired_at: null,
      retirement_reason: null,
    })
    await expect(testImageSurfaceDeliveryIsAuthorized(placement)).resolves.toBe(true)
  })
  it('rejects ownerless insertion and clearing an active owner', async () => {
    const { imageId, placement } = await createSurface()
    await expect(insertTestOwnerlessImageSurface(imageId)).rejects.toThrow(
      'new image surface requires one concrete live owner',
    )
    await expect(clearTestActiveImageSurfaceOwner(placement.placement_id)).rejects.toThrow(
      'image surface placement bindings are immutable',
    )
  })
  it('leaves delivery unauthorized when owner clearing commits during reactivation', async () => {
    const { placement } = await createSurface()
    {
      await using retiring = await beginTransaction()
      await retireTestImageSurfaceOwner(retiring, placement.placement_id)
      await retiring.commit()
    }
    {
      await using reactivating = await beginTransaction()
      await reactivateTestImageSurfaceInTransaction(reactivating, placement.placement_id)
      await using clearing = await beginTransaction()
      await clearTestImageSurfaceOwnerInTransaction(clearing, placement.placement_id)
      await clearing.commit()
      await reactivating.commit()
    }
    const owner = await readTestImageSurfaceOwner(placement.placement_id)
    expect(owner).toMatchObject({
      user_profile_link_id: null,
      retired_at: null,
      retirement_reason: null,
    })
    await expect(
      testImageSurfaceDeliveryIsAuthorized({
        placement_id: placement.placement_id,
        placement_revision: owner!.revision,
        image_id: owner!.image_id,
      }),
    ).resolves.toBe(false)
  })

  it('keeps the active concrete owner when reactivation commits before clearing', async () => {
    const { link, placement } = await createSurface()
    {
      await using retiring = await beginTransaction()
      await retireTestImageSurfaceOwner(retiring, placement.placement_id)
      await retiring.commit()
    }
    {
      await using reactivating = await beginTransaction()
      await reactivateTestImageSurfaceInTransaction(reactivating, placement.placement_id)
      await reactivating.commit()
    }
    {
      await using clearing = await beginTransaction()
      await expect(
        clearTestImageSurfaceOwnerInTransaction(clearing, placement.placement_id),
      ).rejects.toMatchObject({
        code: '23514',
        message: 'image surface placement bindings are immutable',
      })
    }
    await expect(readTestImageSurfaceOwner(placement.placement_id)).resolves.toMatchObject({
      user_profile_link_id: link.id,
      retired_at: null,
      retirement_reason: null,
    })
  })
})
