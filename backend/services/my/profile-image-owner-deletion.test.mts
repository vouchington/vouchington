import { describe, expect, it } from 'vitest'
import {
  getTestDeliveryTransactionPid,
  testDeliveryTransactionIsWaitingForLock,
} from '@voucha/test-helpers/entities/media-delivery-repair'
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
  it('rejects reactivation after waiting for committed owner clearing', async () => {
    const { placement } = await createSurface()
    await using clearing = await beginTransaction()
    await retireTestImageSurfaceOwner(clearing, placement.placement_id)
    await clearTestImageSurfaceOwnerInTransaction(clearing, placement.placement_id)
    await using reactivating = await beginTransaction()
    const pid = await getTestDeliveryTransactionPid(reactivating)
    const result = reactivateTestImageSurfaceInTransaction(
      reactivating,
      placement.placement_id,
    ).then(
      () => null,
      (err: unknown) => err,
    )
    await expect.poll(() => testDeliveryTransactionIsWaitingForLock(pid)).toBe(true)
    await clearing.commit()
    expect(await result).toMatchObject({
      message: 'ownerless image surface must remain retired for owner removal',
    })
  })
  it('rejects owner clearing after waiting for committed reactivation', async () => {
    const { placement } = await createSurface()
    await using retiring = await beginTransaction()
    await retireTestImageSurfaceOwner(retiring, placement.placement_id)
    await retiring.commit()
    await using reactivating = await beginTransaction()
    await reactivateTestImageSurfaceInTransaction(reactivating, placement.placement_id)
    await using clearing = await beginTransaction()
    const pid = await getTestDeliveryTransactionPid(clearing)
    const result = clearTestImageSurfaceOwnerInTransaction(clearing, placement.placement_id).then(
      () => null,
      (err: unknown) => err,
    )
    await expect.poll(() => testDeliveryTransactionIsWaitingForLock(pid)).toBe(true)
    await reactivating.commit()
    expect(await result).toMatchObject({
      message: 'image surface placement bindings are immutable',
    })
  })
})
