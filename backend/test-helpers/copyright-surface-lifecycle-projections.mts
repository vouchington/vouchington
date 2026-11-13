import { onTestFinished, vi } from 'vitest'
import { backgroundQueue as cachePurge } from './shared-background-queue.mts'
import { caches } from '../services/entity-cache/caches.mts'
import { getPostByAny } from '../services/posts/get.mts'
import { getPublicUserByAny } from '../services/users/get.mts'
import { getTopicByAny } from '../services/topics/get.mts'
import { getCommunity } from '../services/communities/get.mts'
import { listProfileLinks } from '../services/my/profile-links.mts'
import type { SurfaceLifecycleFixture } from './copyright-surface-lifecycle-fixtures.mts'

export function ownerCache(fixture: SurfaceLifecycleFixture) {
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

async function warmOwnerCache(fixture: SurfaceLifecycleFixture): Promise<void> {
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

export async function waitForOwnerCacheWarm(fixture: SurfaceLifecycleFixture): Promise<void> {
  const cache = ownerCache(fixture)
  if (!cache) return
  if ((await cache.get(fixture.ownerId)) !== null) {
    await warmOwnerCache(fixture)
    return
  }

  const client = cache.getClient()
  const invokeScript = client.invokeScript
  const physicalKey = cache.getKey(fixture.ownerId)
  const invalidationKey = physicalKey.replace(':{', ':invalidation:{')
  const write = Promise.withResolvers<PromiseSettledResult<void>>()
  const startedWrites: Promise<unknown>[] = []
  const spy = vi.spyOn(client, 'invokeScript').mockImplementation((script, options) => {
    const pending = invokeScript.call(client, script, options)
    // Valkyries reads use one key; invalidation uses two keys but only two args.
    if (
      options?.keys?.length === 2 &&
      String(options.keys[0]) === physicalKey &&
      String(options.keys[1]) === invalidationKey &&
      options.args?.length === 3 &&
      String(options.args[0]) === '1'
    ) {
      startedWrites.push(pending)
      void pending
        .then(() => write.resolve({ status: 'fulfilled', value: undefined }))
        .catch((err: unknown) => write.resolve({ status: 'rejected', reason: err }))
    }
    return pending
  })
  let warmCompletion: Promise<void> | undefined
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (): Promise<void> => {
    cleanupPromise ??= (async () => {
      if (warmCompletion) await Promise.allSettled([warmCompletion])
      spy.mockRestore()
      write.resolve({ status: 'rejected', reason: new Error('Owner cache write was not observed') })
      await Promise.allSettled(startedWrites)
    })()
    return cleanupPromise
  }
  onTestFinished(cleanup)
  try {
    warmCompletion = warmOwnerCache(fixture)
    await warmCompletion
    const result = await write.promise
    if (result.status === 'rejected') throw result.reason
  } finally {
    await cleanup()
  }
}

/**
 * Writes the owner entity straight into its cache entry. An invalidation leaves a marker that makes
 * `cacheGetByAny` skip its refill until the marker expires, so after the withhold a warm read never
 * repopulates the entry; the restore's invalidation is only observable if the entry exists first.
 */
export async function seedOwnerCache(fixture: SurfaceLifecycleFixture): Promise<void> {
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

export async function publicImageIsProjected(fixture: SurfaceLifecycleFixture): Promise<boolean> {
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

export async function communityPurgeWasQueued(id: string): Promise<boolean> {
  const jobs = await Promise.all(
    (['waiting', 'active', 'delayed', 'completed', 'failed'] as const).map(state =>
      cachePurge.getJobs(state),
    ),
  )
  return jobs
    .flat()
    .some(job => (job.data as { tags?: string[] }).tags?.includes(`community:${id}`))
}
