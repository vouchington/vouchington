import { afterEach, describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestImageSurfacePlacements,
  getTestPostImagePlacement,
  overrideDynamicConfigFieldsForTest,
  setTestUserProfileImage,
} from '@voucha/test-helpers'
import { markImageDeletedPendingPlacementRetirement } from '@voucha/test-helpers/entities/images'
import { createImageDeletionFixture } from '@voucha/test-helpers/image-deletion'
import { retireImagePlacementsForDeletedImage } from './placements.mts'
import { retireImageSurfacePlacementsForDeletedImage } from './surface-placements.mts'
import { imagesWorkConfig } from './work-limits.mts'

describe('image placement retirement pages', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('bounds inspection, advances through replayed no-ops, and leaves an excluded image untouched', async () => {
    const owned = await createImageDeletionFixture(2)
    const excluded = await createImageDeletionFixture(1)
    const firstUser = await createTestUserDirect()
    const secondUser = await createTestUserDirect()
    await setTestUserProfileImage(firstUser.id, owned.imageId)
    await setTestUserProfileImage(secondUser.id, owned.imageId)
    const bindings = await Promise.all(
      owned.postIds.map(id => getTestPostImagePlacement(id, owned.imageId)),
    )
    const placementIds = bindings.map(binding => binding!.placement_id).toSorted()
    const surfaces = await getTestImageSurfacePlacements({ imageId: owned.imageId })
    expect(surfaces).toHaveLength(2)
    await markImageDeletedPendingPlacementRetirement(owned.imageId)
    await markImageDeletedPendingPlacementRetirement(excluded.imageId)
    restore = overrideDynamicConfigFieldsForTest(imagesWorkConfig, { deletion_page_size: 1 })

    await using transaction = await beginTransaction()
    await expect(retireImagePlacementsForDeletedImage(owned.imageId, transaction)).resolves.toEqual(
      [placementIds[0]],
    )
    // A recovery job can restart at the first binding without spending another revision.
    await expect(retireImagePlacementsForDeletedImage(owned.imageId, transaction)).resolves.toEqual(
      [placementIds[0]],
    )
    await expect(
      retireImagePlacementsForDeletedImage(owned.imageId, transaction, placementIds[0]),
    ).resolves.toEqual([placementIds[1]])
    await expect(
      retireImagePlacementsForDeletedImage(owned.imageId, transaction, placementIds[1]),
    ).resolves.toEqual([])
    await expect(
      retireImageSurfacePlacementsForDeletedImage(owned.imageId, transaction),
    ).resolves.toEqual([surfaces[0]!.placement_id])
    await expect(
      retireImageSurfacePlacementsForDeletedImage(owned.imageId, transaction),
    ).resolves.toEqual([surfaces[0]!.placement_id])
    await expect(
      retireImageSurfacePlacementsForDeletedImage(
        owned.imageId,
        transaction,
        surfaces[0]!.placement_id,
      ),
    ).resolves.toEqual([surfaces[1]!.placement_id])
    await expect(
      retireImageSurfacePlacementsForDeletedImage(
        owned.imageId,
        transaction,
        surfaces[1]!.placement_id,
      ),
    ).resolves.toEqual([])
    await transaction.commit()

    for (const [index, postId] of owned.postIds.entries()) {
      await expect(getTestPostImagePlacement(postId, owned.imageId)).resolves.toMatchObject({
        retired_at: expect.any(Date),
        retirement_reason: 'asset_deleted',
        placement_revision: bindings[index]!.placement_revision + 1,
      })
    }
    const retiredSurfaces = await getTestImageSurfacePlacements({ imageId: owned.imageId })
    expect(retiredSurfaces.map(surface => surface.placement_revision)).toEqual(
      surfaces.map(surface => surface.placement_revision + 1),
    )
    expect(retiredSurfaces.every(surface => surface.retirement_reason === 'asset_deleted')).toBe(
      true,
    )
    await expect(
      getTestPostImagePlacement(excluded.postIds[0]!, excluded.imageId),
    ).resolves.toMatchObject({ retired_at: null })
  })
})
