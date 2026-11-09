import { withTestImageWriterLockWait } from '@voucha/test-helpers/image-writer-lock-race'
import {
  beginTransaction,
  createTestUserDirect,
  getTestImageSurfacePlacements,
  insertTestImage,
  insertTestTopic,
  setTestTopicSurfaceImages,
} from '@voucha/test-helpers'
import { advanceTestDeliveryPlacementRevision } from '@voucha/test-helpers/entities/media-delivery-repair'
import { retireTestTopicSurfaces } from '@voucha/test-helpers/image-surface-mutation-race'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { describe, expect, it } from 'vitest'
import { writeImageSurfaceMutation } from './surface-mutation.mts'

describe('multi-slot owner capacity and delivery', () => {
  it('waits for actual placement writes and denies both exact prior tuples after the owner mutation', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const topicId = await insertTestTopic({
      name: `multi-slot ${crypto.randomUUID()}`,
      slug: `multi-slot-${crypto.randomUUID()}`,
      createdById: user.id,
    })
    await setTestTopicSurfaceImages(topicId, { logoImageId: imageId, heroImageId: imageId })
    const placements = await getTestImageSurfacePlacements({ topicId })
    expect(placements).toHaveLength(2)
    const edge = installTestMediaDeliveryEdge()
    await using blocker = await beginTransaction()
    const changed = placements[0]!
    const revision = await advanceTestDeliveryPlacementRevision(blocker, changed.placement_id)
    await withTestImageWriterLockWait(
      blocker,
      'retireTestTopicSurfaces',
      async () => {
        await using owner = await beginTransaction()
        await writeImageSurfaceMutation(
          owner,
          [
            { surfaceKind: 'topic-logo-image', topicId, nextImageId: null },
            { surfaceKind: 'topic-hero-image', topicId, nextImageId: null },
          ],
          null,
          (_before, scopeQuery) => retireTestTopicSurfaces(topicId, scopeQuery),
        )
        await owner.commit()
      },
      () => {
        expect(edge.put).not.toHaveBeenCalled()
      },
    )
    expect(edge.put).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: `image-placement:${changed.placement_id}:${revision}:${imageId}`,
        state: 'withheld',
      }),
    )
    expect(edge.put.mock.calls.filter(([record]) => record.state === 'withheld')).toHaveLength(2)
  })
})
