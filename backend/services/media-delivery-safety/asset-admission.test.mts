import { withTestImageWriterLockWait } from '@voucha/test-helpers/image-writer-lock-race'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestImage,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers'
import { writeTestImageSurfaceMutation } from '@voucha/test-helpers/image-surface-mutation'
import { flagTestDeliveryImageInTransaction } from '@voucha/test-helpers/entities/media-delivery-repair'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'

describe('concrete image policy admission', () => {
  it('rejects a new surface behind an uncommitted unsafe image before edge effects', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const edge = installTestMediaDeliveryEdge()
    await using unsafe = await beginTransaction()
    await flagTestDeliveryImageInTransaction(unsafe, imageId)
    const error = await withTestImageWriterLockWait(
      unsafe,
      'writeTestUserImageSurface',
      async () => {
        await using owner = await beginTransaction()
        return await writeTestImageSurfaceMutation(
          { surfaceKind: 'user-profile-image', userId: user.id },
          imageId,
          user.id,
          owner,
        ).then(
          () => null,
          (err: unknown) => err,
        )
      },
      () => {
        expect(edge.put).not.toHaveBeenCalled()
      },
    )
    expect(error).not.toBeNull()
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestImageSurfacePlacements({ imageId })).toEqual([])
  })

  it('retries a missed uncommitted binding and denies its current concrete tuple', async () => {
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
    if (!tuple) throw new Error('Missing owned surface')
    await withTestImageWriterLockWait(owner, 'flagTestDeliveryImageInTransaction', async () => {
      await using unsafe = await beginTransaction()
      await flagTestDeliveryImageInTransaction(unsafe, imageId)
      await unsafe.commit()
    })
    const key = getImagePlacementDeliveryKey({
      placementId: tuple.placement_id,
      revision: tuple.placement_revision,
      imageId,
    })
    expect(edge.records.get(key)?.state).toBe('withheld')
  })
})
