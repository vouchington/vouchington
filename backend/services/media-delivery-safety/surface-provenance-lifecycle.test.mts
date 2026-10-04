import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getTestImageSurfacePlacementActivations,
  getTestImageSurfacePlacements,
  insertTestCommunity,
  insertTestImage,
  setTestCommunitySurfaceImages,
} from '@voucha/test-helpers'
import { updateCommunity } from '../communities/update.mts'

describe('surface activation identity across ownership changes', () => {
  it('records a new setter when another actor reactivates the same image placement', async () => {
    const [creator, administrator, uploader] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect({ administrator: true }),
      createTestUserDirect(),
    ])
    const imageId = await insertTestImage(uploader.id)
    const community = await insertTestCommunity({ createdById: creator.id })
    await setTestCommunitySurfaceImages(community.id, { bannerImageId: imageId })
    const [initial] = await getTestImageSurfacePlacements({
      communityId: community.id,
      surfaceKind: 'community-banner-image',
      imageId,
    })
    if (!initial) throw new Error('First image activation missing')
    await updateCommunity(administrator, community.id, { banner_image_id: null })
    await updateCommunity(administrator, community.id, { banner_image_id: imageId })
    const [current] = await getTestImageSurfacePlacements({
      communityId: community.id,
      surfaceKind: 'community-banner-image',
      imageId,
    })
    expect(current).toMatchObject({ placement_id: initial.placement_id, retired_at: null })
    expect(current!.placement_revision).toBeGreaterThan(initial.placement_revision)
    expect(await getTestImageSurfacePlacementActivations(initial.placement_id)).toEqual([
      expect.objectContaining({
        placement_revision: initial.placement_revision,
        bound_by_user_id: creator.id,
        uploaded_by_user_id: uploader.id,
        bound_by_administrator: false,
      }),
      expect.objectContaining({
        placement_revision: current!.placement_revision,
        bound_by_user_id: administrator.id,
        uploaded_by_user_id: uploader.id,
        bound_by_administrator: true,
      }),
    ])
  })
})
