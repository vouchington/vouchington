import { it, expect, describe } from 'vitest'
import { createTestUser, createTestPost } from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import {
  enqueueBulkRefreshPostMetricsById,
  enqueueBulkRefreshUserMetricsById,
} from './enqueues.mts'

// enqueueBulkRefreshTopicMetricsById is covered by
// backend/services/topics/enqueues.generated.test.mts — relocated there because exercising it
// needs @services/topics/create, and @services/topics already depends on this queue package for
// real enqueue calls (avoids a workspace cycle).
//
// Neither test below waits for `processPostCreated`/`processUserCreated` (the entity-listener
// processors) to complete: `refresh.post_metrics`/`refreshUserMetricsCache` (the jobs enqueued
// here) read the post/user row directly from Postgres, independent of those processors' own
// side effects (embeddings, bloom-filter backfill, OAuth linking, etc).
describe('enqueues.generated', () => {
  it('enqueueBulkRefreshPostMetricsById refreshes post metrics cache', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })

    // The test queue flushes the refresh job before enqueue resolves, so the cache write is done.
    await enqueueBulkRefreshPostMetricsById([post.id])

    expect(await caches.post_metrics.get(post.id)).not.toBeNull()
  })

  it('enqueueBulkRefreshUserMetricsById refreshes user metrics cache', async () => {
    const user = await createTestUser({ administrator: true })

    await enqueueBulkRefreshUserMetricsById([user!.id])

    expect(await caches.user_metrics.get(user!.id)).not.toBeNull()
    expect(await caches.user_metrics.get(user!.username!)).not.toBeNull()
  })
})
