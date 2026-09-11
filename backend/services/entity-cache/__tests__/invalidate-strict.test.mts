import { describe, expect, it } from 'vitest'
import { caches } from '../caches.mts'
import {
  invalidateCommunityStrict,
  invalidatePostStrict,
  invalidateRssFeedStrict,
  invalidateStoryStrict,
} from '../invalidate-strict.mts'

describe('strict entity cache invalidation', () => {
  it('invalidates post metrics with the post publication identity', async () => {
    const postId = crypto.randomUUID()
    await caches.post_metrics.set(postId, { stale: true })
    expect(await caches.post_metrics.get(postId)).not.toBeNull()

    await invalidatePostStrict(postId)

    expect(await caches.post_metrics.get(postId)).toBeNull()
  })

  it('propagates strict community, RSS, and story tag invalidation', async () => {
    await expect(invalidateCommunityStrict(crypto.randomUUID())).resolves.toBeUndefined()
    await expect(invalidateRssFeedStrict(crypto.randomUUID())).resolves.toBeUndefined()
    await expect(invalidateStoryStrict(crypto.randomUUID())).resolves.toBeUndefined()
  })
})
