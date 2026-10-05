import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { pollUntilNotNull } from '@voucha/test-helpers/polling'
import { cachePurge } from '../../queues/cache-purge/queues.mts'
import { caches } from '@services/entity-cache/caches'
import { getPostByAny } from '@services/posts/get'
import { getPublicUserByAny } from '@services/users/get'
import { getTopicByAny } from '../topics/get.mts'
import { getCommunity } from '../communities/get.mts'
import { listProfileLinks } from '../my/profile-links.mts'
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
import { getImagePlacementDeliveryKey } from '@services/media-delivery-safety/delivery-registry-types'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { completeCopyrightMandatoryHumanReview, processCopyrightActionIntent } from './index.mts'

type SurfaceFixture = Awaited<ReturnType<typeof createTestCopyrightImageFixture>>

function ownerCache(fixture: SurfaceFixture) {
  switch (fixture.ownerKind) {
    case 'post':
      return caches.posts
    case 'user':
      return caches.users_public
    case 'topic':
      return caches.topics
    case 'community':
      return null // Community pages use edge Cache-Tag purges, not a Valkey entity cache.
  }
}

async function warmOwnerCache(fixture: SurfaceFixture): Promise<void> {
  switch (fixture.ownerKind) {
    case 'post':
      await caches.posts.cacheGetByAny(getPostByAny)(fixture.ownerId)
      break
    case 'user':
      await caches.users_public.cacheGetByAny(getPublicUserByAny)(fixture.ownerId)
      break
    case 'topic':
      await caches.topics.cacheGetByAny(getTopicByAny)(fixture.ownerId)
      break
    case 'community':
      break
  }
}

/**
 * Writes the owner entity straight into its cache entry. An invalidation leaves a marker that makes
 * `cacheGetByAny` skip its refill until the marker expires, so after the withhold a warm read never
 * repopulates the entry; the restore's invalidation is only observable if the entry exists first.
 */
async function seedOwnerCache(fixture: SurfaceFixture): Promise<void> {
  switch (fixture.ownerKind) {
    case 'post':
      await caches.posts.set(fixture.ownerId, await getPostByAny(fixture.ownerId))
      break
    case 'user':
      await caches.users_public.set(fixture.ownerId, await getPublicUserByAny(fixture.ownerId))
      break
    case 'topic':
      await caches.topics.set(fixture.ownerId, await getTopicByAny(fixture.ownerId))
      break
    case 'community':
      break
  }
}

async function publicImageIsProjected(fixture: SurfaceFixture): Promise<boolean> {
  switch (fixture.selector.surfaceKind) {
    case 'post-image':
      return Boolean(
        (await getPostByAny(fixture.ownerId))?.images?.some(
          image => image.image_id === fixture.imageId,
        ),
      )
    case 'user-profile-image':
      return (
        (await getPublicUserByAny(fixture.ownerId))?.profile_image_placement?.image_id ===
        fixture.imageId
      )
    case 'user-profile-link-image': {
      const profileLinkId = fixture.selector.userProfileLinkId
      return (await listProfileLinks(fixture.ownerId)).some(
        link => link.id === profileLinkId && link.image_placement?.image_id === fixture.imageId,
      )
    }
    case 'topic-logo-image':
      return (
        (await getTopicByAny(fixture.ownerId))?.logo_image_placement?.image_id === fixture.imageId
      )
    case 'topic-hero-image':
      return (
        (await getTopicByAny(fixture.ownerId))?.hero_image_placement?.image_id === fixture.imageId
      )
    case 'community-profile-image':
      return (
        (await getCommunity(fixture.ownerId))?.profile_image_placement?.image_id === fixture.imageId
      )
    case 'community-banner-image':
      return (
        (await getCommunity(fixture.ownerId))?.banner_image_placement?.image_id === fixture.imageId
      )
  }
}

async function communityPurgeWasQueued(id: string): Promise<boolean> {
  const jobs = await Promise.all(
    (['waiting', 'active', 'delayed', 'completed', 'failed'] as const).map(state =>
      cachePurge.getJobs(state),
    ),
  )
  return jobs
    .flat()
    .some(job => (job.data as { tags?: string[] }).tags?.includes(`community:${id}`))
}

describe('copyright surface target lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(TEST_COPYRIGHT_IMAGE_KINDS)(
    'withholds and restores a %s through the exact placement and delivery registry',
    async kind => {
      const edge = installTestMediaDeliveryEdge()
      const fixture = await createTestCopyrightImageFixture(kind)
      const { deliveryKey } = await stageImagePlacementDeliveryRecord({
        placementId: fixture.placementId,
        revision: fixture.placementRevision,
        imageId: fixture.imageId,
        state: 'allow',
      })
      await completeTestMediaDeliveryRecord(deliveryKey)
      expect(await publicImageIsProjected(fixture)).toBe(true)
      const caseRecord = await createTestCopyrightRestrictionForImage(fixture)
      const cache = ownerCache(fixture)
      await warmOwnerCache(fixture)
      if (cache) {
        await pollUntilNotNull(() => cache.get(fixture.ownerId), 2000, 25, 'the warmed owner entry')
      }
      expect(await getImagePlacementCopyrightOwner(fixture.placementId)).toEqual({
        kind: fixture.ownerKind,
        id: fixture.ownerId,
      })

      await expect(processCopyrightActionIntent(caseRecord.withholdIntentId)).resolves.toBe(
        'applied',
      )
      expect(cache ? (await cache.get(fixture.ownerId)) === null : true).toBe(true)
      if (cache) await seedOwnerCache(fixture)
      expect(cache ? (await cache.get(fixture.ownerId)) !== null : true).toBe(true)
      const purgeQueued = cache
        ? true
        : await pollUntilNotNull(
            async () => ((await communityPurgeWasQueued(fixture.ownerId)) ? true : null),
            2000,
            25,
            'the community cache purge to be queued',
          )
      expect(purgeQueued).toBe(true)
      expect(await publicImageIsProjected(fixture)).toBe(false)
      const withheld = await getImagePlacementForCopyright(fixture.placementId)
      expect(withheld).toMatchObject({ withheld: true, imageId: fixture.imageId })
      const withheldKey = getImagePlacementDeliveryKey({
        placementId: fixture.placementId,
        revision: withheld!.revision,
        imageId: fixture.imageId,
      })
      expect(edge.records.get(withheldKey)?.state).toBe('withheld')

      await completeCopyrightMandatoryHumanReview({
        noticeId: caseRecord.noticeId,
        restrictionId: caseRecord.restrictionId,
        currentUser: caseRecord.moderator,
        action: 'reverse',
        rationale: 'The image can be restored after human review.',
        reviewedAt: new Date(),
      })
      const aggregate = await getCopyrightNoticePrivateAggregate(caseRecord.noticeId)
      const restoreIntent = aggregate?.actionIntents.find(intent => intent.action === 'restore')
      if (!restoreIntent) throw new Error('Copyright restore intent missing')
      await expect(processCopyrightActionIntent(restoreIntent.id)).resolves.toBe('applied')
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

  it('keeps a withheld avatar denied after the owner detaches and reattaches the same image', async () => {
    const edge = installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('user-profile-image')
    const caseRecord = await createTestCopyrightRestrictionForImage(fixture)
    await expect(processCopyrightActionIntent(caseRecord.withholdIntentId)).resolves.toBe('applied')
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
