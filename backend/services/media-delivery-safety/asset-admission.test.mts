import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestMediaDeliveryRecord,
  insertTestImage,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers'
import { testImageSurfaceDeliveryIsAuthorized } from '@voucha/test-helpers/entities/image-surface-owner-deletion'
import { getTestMediaDeliveryRegistryRecordId } from '@voucha/test-helpers/entities/image-surface-placements'
import { flagTestDeliveryImageInTransaction } from '@voucha/test-helpers/entities/media-delivery-repair'
import { writeTestImageSurfaceMutation } from '@voucha/test-helpers/image-surface-mutation'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'

describe('concrete image policy admission', () => {
  it('rejects a committed unsafe image before edge effects', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const edge = installTestMediaDeliveryEdge()
    await using unsafe = await beginTransaction()
    await flagTestDeliveryImageInTransaction(unsafe, imageId)
    await unsafe.commit()
    await using owner = await beginTransaction()
    const error = await writeTestImageSurfaceMutation(
      { surfaceKind: 'user-profile-image', userId: user.id },
      imageId,
      user.id,
      owner,
    ).then(
      () => null,
      (err: unknown) => err,
    )
    expect(error).toEqual(
      expect.objectContaining({ message: 'Image is not ready for a public surface' }),
    )
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestImageSurfacePlacements({ imageId })).toEqual([])
  })

  it('does not push an edge denial when a published image is flagged', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const edge = installTestMediaDeliveryEdge()
    await using owner = await beginTransaction()
    const tuple = await writeTestImageSurfaceMutation(
      { surfaceKind: 'user-profile-image', userId: user.id },
      imageId,
      user.id,
      owner,
    )
    await owner.commit()
    if (!tuple) throw new Error('Missing owned surface')
    const recordId = await getTestMediaDeliveryRegistryRecordId({
      placementId: tuple.placement_id,
      revision: tuple.placement_revision,
      imageId,
    })
    if (!recordId) throw new Error('Missing registry identity')
    expect(await getTestMediaDeliveryRecord(recordId)).toMatchObject({ desired_state: 'allow' })
    expect(edge.put).not.toHaveBeenCalled()
    await using unsafe = await beginTransaction()
    await flagTestDeliveryImageInTransaction(unsafe, imageId)
    await unsafe.commit()
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestMediaDeliveryRecord(recordId)).toMatchObject({ desired_state: 'allow' })
    await expect(
      testImageSurfaceDeliveryIsAuthorized({
        placement_id: tuple.placement_id,
        placement_revision: tuple.placement_revision,
        image_id: imageId,
      }),
    ).resolves.toBe(false)
  })
})
