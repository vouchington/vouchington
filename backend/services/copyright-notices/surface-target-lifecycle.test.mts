import {
  ownerCache,
  waitForOwnerCacheWarm,
  seedOwnerCache,
  publicImageIsProjected,
  communityPurgeWasQueued,
} from '@voucha/test-helpers/copyright-surface-lifecycle-projections'
import { seedCompletedReversalStatement } from '@voucha/test-helpers/copyright-restored-statement-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import * as cachePurgeEnqueues from '../../queues/cache-purge/enqueues.mts'
import { stageImagePlacementDeliveryRecord } from '../media-delivery-safety/delivery-registry-staging.mts'
import {
  completeTestMediaDeliveryRecord,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers/entities/image-surface-placements'
import { testImageSurfaceDeliveryIsAuthorized } from '@voucha/test-helpers/entities/image-surface-owner-deletion'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
  TEST_COPYRIGHT_IMAGE_KINDS,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  getImagePlacementForCopyright,
  getImagePlacementCopyrightOwner,
} from '@services/images/placements'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import {
  seedSurfaceLifecycleWithhold,
  seedSurfaceLifecycleReversal,
} from '@voucha/test-helpers/copyright-surface-lifecycle-fixtures'
import {
  assertSurfaceLifecycleWithhold,
  assertSurfaceLifecycleRestore,
} from '@voucha/test-helpers/copyright-surface-lifecycle-subjects'

describe('copyright surface target lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(TEST_COPYRIGHT_IMAGE_KINDS)(
    'projects a committed %s withholding and restoration through the exact owner cache and delivery tuple',
    async kind => {
      const edge = installTestMediaDeliveryEdge()
      const fixture = await createTestCopyrightImageFixture(kind)
      const { mediaDeliveryRegistryRecordId } = await stageImagePlacementDeliveryRecord({
        placementId: fixture.placementId,
        revision: fixture.placementRevision,
        imageId: fixture.imageId,
        state: 'allow',
      })
      await completeTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
      expect(await publicImageIsProjected(fixture)).toBe(true)
      const caseRecord = await createTestCopyrightRestrictionForImage(fixture)
      const cache = ownerCache(fixture)
      await waitForOwnerCacheWarm(fixture)
      const warmedEntry = cache ? await cache.get(fixture.ownerId) : true
      expect(warmedEntry).not.toBeNull()
      expect(await getImagePlacementCopyrightOwner(fixture.placementId)).toEqual({
        kind: fixture.ownerKind,
        id: fixture.ownerId,
      })

      const purgeEnqueue = cache ? null : vi.spyOn(cachePurgeEnqueues, 'enqueueBulkPurgeCacheTags')
      const matchingPurgeCalls = () =>
        purgeEnqueue?.mock.calls.filter(([tags]) => tags.includes(`community:${fixture.ownerId}`))
          .length ?? 0
      await seedSurfaceLifecycleWithhold(fixture, caseRecord)
      expect(cache ? (await cache.get(fixture.ownerId)) === null : true).toBe(true)
      if (cache) await seedOwnerCache(fixture)
      expect(cache ? (await cache.get(fixture.ownerId)) !== null : true).toBe(true)
      const purgeQueued = cache ? true : await communityPurgeWasQueued(fixture.ownerId)
      expect(purgeQueued).toBe(true)
      expect(matchingPurgeCalls()).toBe(cache ? 0 : 1)
      expect(await publicImageIsProjected(fixture)).toBe(false)
      const withheld = await getImagePlacementForCopyright(fixture.placementId)
      expect(withheld).toMatchObject({ withheld: true, imageId: fixture.imageId })
      const withheldKey = getImagePlacementDeliveryKey({
        placementId: fixture.placementId,
        revision: withheld!.revision,
        imageId: fixture.imageId,
      })
      expect(edge.records.get(withheldKey)?.state).toBe('withheld')

      const restoreIntent = await seedSurfaceLifecycleReversal(caseRecord)
      await seedCompletedReversalStatement(restoreIntent.id)
      expect(matchingPurgeCalls()).toBe(cache ? 0 : 2)
      expect(cache ? (await cache.get(fixture.ownerId)) === null : true).toBe(true)
      expect(await publicImageIsProjected(fixture)).toBe(true)
      const restored = await getImagePlacementForCopyright(fixture.placementId)
      expect(restored).toMatchObject({ withheld: false, imageId: fixture.imageId })
      const restoredKey = getImagePlacementDeliveryKey({
        placementId: fixture.placementId,
        revision: restored!.revision,
        imageId: fixture.imageId,
      })
      expect(edge.records.get(restoredKey)?.state).toBe('allow')
    },
  )

  it.each(TEST_COPYRIGHT_IMAGE_KINDS)(
    'runs the real %s withhold job once with complete legal and tuple states',
    async kind => {
      expect.hasAssertions()
      const edge = installTestMediaDeliveryEdge()
      const fixture = await createTestCopyrightImageFixture(kind)
      const { mediaDeliveryRegistryRecordId } = await stageImagePlacementDeliveryRecord({
        placementId: fixture.placementId,
        revision: fixture.placementRevision,
        imageId: fixture.imageId,
        state: 'allow',
      })
      await completeTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
      const record = await createTestCopyrightRestrictionForImage(fixture)
      edge.put.mockClear()
      await assertSurfaceLifecycleWithhold(fixture, record)
      const owned = edge.put.mock.calls.flatMap(([row]) =>
        row.deliveryKey.startsWith(`image-placement:${fixture.placementId}:`) ? [row] : [],
      )
      expect(owned.every(row => row.state === 'withheld')).toBe(true)
    },
  )

  it.each(TEST_COPYRIGHT_IMAGE_KINDS)(
    'runs the real %s restore job once from a committed reverse decision',
    async kind => {
      expect.hasAssertions()
      const edge = installTestMediaDeliveryEdge()
      const fixture = await createTestCopyrightImageFixture(kind)
      const record = await createTestCopyrightRestrictionForImage(fixture)
      await seedSurfaceLifecycleWithhold(fixture, record)
      const restore = await seedSurfaceLifecycleReversal(record)
      edge.put.mockClear()
      await assertSurfaceLifecycleRestore(fixture, record, restore.id)
      const current = await getImagePlacementForCopyright(fixture.placementId)
      const currentKey = getImagePlacementDeliveryKey({
        placementId: fixture.placementId,
        revision: current!.revision,
        imageId: fixture.imageId,
      })
      const owned = edge.put.mock.calls.flatMap(([row]) =>
        row.deliveryKey.startsWith(`image-placement:${fixture.placementId}:`) ? [row] : [],
      )
      expect(owned.every(row => row.state === 'withheld' || row.deliveryKey === currentKey)).toBe(
        true,
      )
    },
  )

  it('keeps a withheld avatar denied after the owner detaches and reattaches the same image', async () => {
    const edge = installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('user-profile-image')
    const caseRecord = await createTestCopyrightRestrictionForImage(fixture)
    await seedSurfaceLifecycleWithhold(fixture, caseRecord)
    await fixture.detach()
    const { setTestUserProfileImage } =
      await import('@voucha/test-helpers/entities/media-surface-writes')
    await setTestUserProfileImage(fixture.ownerId, fixture.imageId)
    const [placement] = await getTestImageSurfacePlacements({
      userId: fixture.ownerId,
      surfaceKind: 'user-profile-image',
      imageId: fixture.imageId,
    })
    expect(placement?.placement_id).toBe(fixture.placementId)
    expect(await getImagePlacementForCopyright(fixture.placementId)).toMatchObject({
      withheld: true,
      imageId: fixture.imageId,
    })
    await expect(
      testImageSurfaceDeliveryIsAuthorized({
        placement_id: placement!.placement_id,
        placement_revision: placement!.placement_revision,
        image_id: fixture.imageId,
      }),
    ).resolves.toBe(false)
    expect(edge.records.size).toBeGreaterThan(0)
  })
})
