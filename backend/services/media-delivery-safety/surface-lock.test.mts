import { beginTransaction } from '@data-stores/psql'
import {
  createTestUserDirect,
  getTestImageSurfacePlacements,
  insertTestImage,
  insertTestTopic,
  setTestTopicSurfaceImages,
} from '@voucha/test-helpers'
import {
  getTestDeliveryTransactionPid,
  advanceTestDeliveryPlacementRevision,
  testDeliveryTransactionIsWaitingForLock,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lockImageDeliveryMutation, prepublishImageSurfaceDenials } from './index.mts'

describe('multi-slot owner delivery fences', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('takes the entire canonical placement footprint before any slot denial', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const topicId = await insertTestTopic({
      name: `multi-slot ${crypto.randomUUID()}`,
      slug: `multi-slot-${crypto.randomUUID()}`,
      createdById: user.id,
    })
    await setTestTopicSurfaceImages(topicId, { logoImageId: imageId, heroImageId: imageId })
    const placements = (await getTestImageSurfacePlacements({ topicId })).toSorted((a, b) =>
      a.placement_id.localeCompare(b.placement_id),
    )
    expect(placements).toHaveLength(2)
    const [firstPlacement, secondPlacement] = placements
    const edge = installTestMediaDeliveryEdge()
    await using first = await beginTransaction()
    await using owner = await beginTransaction()
    await using later = await beginTransaction()
    await lockImageDeliveryMutation(first, {
      placementIds: [firstPlacement!.placement_id],
      placementOnly: true,
    })
    const ownerPid = await getTestDeliveryTransactionPid(owner)
    const owning = (async () => {
      await prepublishImageSurfaceDenials(
        [
          { surfaceKind: 'topic-hero-image', topicId },
          { surfaceKind: 'topic-logo-image', topicId },
        ],
        owner,
      )
      await owner.commit()
    })()
    let result: PromiseSettledResult<void> | undefined
    let locking: Promise<void> | undefined
    let laterCommitted = false
    let firstCommitted = false
    let advancedRevision = firstPlacement!.placement_revision
    try {
      await vi.waitFor(async () =>
        expect(await testDeliveryTransactionIsWaitingForLock(ownerPid)).toBe(true),
      )
      locking = lockImageDeliveryMutation(later, {
        placementIds: [secondPlacement!.placement_id],
        placementOnly: true,
      }).then(
        value => {
          result = { status: 'fulfilled', value }
          return value
        },
        reason => {
          result = { status: 'rejected', reason }
        },
      )
      await vi.waitFor(() => expect(result).toBeDefined())
      if (result?.status === 'rejected') throw result.reason
      expect(edge.put).not.toHaveBeenCalled()
      await later.commit()
      laterCommitted = true
      advancedRevision = await advanceTestDeliveryPlacementRevision(
        first,
        firstPlacement!.placement_id,
      )
      await first.commit()
      firstCommitted = true
    } finally {
      if (!firstCommitted) await first.rollback()
      await locking
      if (!laterCommitted) await later.rollback()
      await Promise.allSettled([owning])
    }
    await expect(owning).resolves.toBeUndefined()
    expect(
      edge.put.mock.calls.filter(([record]) => record.deliveryKey.startsWith('image-placement:')),
    ).toHaveLength(2)
    expect(edge.put).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: `image-placement:${firstPlacement!.placement_id}:${advancedRevision}:${imageId}`,
        state: 'withheld',
      }),
    )
  })
})
