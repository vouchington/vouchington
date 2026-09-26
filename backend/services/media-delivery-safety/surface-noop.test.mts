import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestCommunity,
  insertTestTopic,
  getTestImageSurfacePlacements,
  setTestCommunitySurfaceImages,
  setTestTopicSurfaceImages,
  markImageModerationFlagged,
} from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementDeliveryKey, processMediaDeliveryRegistryRecord } from './index.mts'
import { updateCommunity } from '../communities/update.mts'
import { getTopicByAny } from '../topics/get.mts'
import { updateTopic } from '../topics/update.mts'
import '../images/register-image-exists-guard.mts'

describe('unchanged surface image updates', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(['community', 'topic'] as const)(
    'keeps %s same-value image routes allowed without publishing a denial',
    async kind => {
      const user = await createTestUser({ administrator: true })
      const imageId = await insertTestImage(user.id)
      const id =
        kind === 'community'
          ? (await insertTestCommunity({ createdById: user.id })).id
          : await insertTestTopic({
              name: `noop-${crypto.randomUUID()}`,
              slug: `noop-${crypto.randomUUID()}`,
              createdById: user.id,
            })
      if (kind === 'community')
        await setTestCommunitySurfaceImages(id, { profileImageId: imageId, bannerImageId: imageId })
      else await setTestTopicSurfaceImages(id, { logoImageId: imageId, heroImageId: imageId })
      const placements = await getTestImageSurfacePlacements(
        kind === 'community' ? { communityId: id } : { topicId: id },
      )
      const edge = installTestMediaDeliveryEdge()
      const keys = placements.map(placement =>
        getImagePlacementDeliveryKey({
          placementId: placement.placement_id,
          revision: placement.placement_revision,
          imageId,
        }),
      )
      await Promise.all(keys.map(key => processMediaDeliveryRegistryRecord(key)))
      edge.put.mockClear()
      if (kind === 'community')
        await updateCommunity(user, id, {
          profile_image_id: imageId.toUpperCase(),
          banner_image_id: imageId,
        })
      else
        await updateTopic(
          user,
          (await getTopicByAny(id))!,
          { logo_image_id: imageId.toUpperCase(), hero_image_id: imageId },
          { skipSideEffects: true },
        )
      expect(edge.put).not.toHaveBeenCalled()
      await markImageModerationFlagged(imageId)
      if (kind === 'community')
        await updateCommunity(user, id, { profile_image_id: imageId, banner_image_id: imageId })
      else
        await updateTopic(
          user,
          (await getTopicByAny(id))!,
          { logo_image_id: imageId, hero_image_id: imageId },
          { skipSideEffects: true },
        )
      expect(edge.put).not.toHaveBeenCalled()
      if (kind === 'topic') {
        await updateTopic(
          user,
          (await getTopicByAny(id))!,
          { name: `undefined-${crypto.randomUUID()}`, logo_image_id: undefined },
          { skipSideEffects: true },
        )
      }
      expect(edge.put).not.toHaveBeenCalled()
      for (const key of keys) expect(edge.records.get(key)?.state).toBe('allow')
      expect(
        await getTestImageSurfacePlacements(
          kind === 'community' ? { communityId: id } : { topicId: id },
        ),
      ).toEqual(placements)
    },
  )
})
