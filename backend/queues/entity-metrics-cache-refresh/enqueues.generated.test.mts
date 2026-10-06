import type { Job } from 'glide-mq'
import { it, expect, describe } from 'vitest'
import { createTestUser, createTestPost } from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { entityMetricsCacheRefresh } from '@workers/entity-metrics-cache-refresh/workers'
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

    await waitForMetricsRefresh(post.id, () => enqueueBulkRefreshPostMetricsById([post.id]))

    expect(await caches.post_metrics.get(post.id)).not.toBeNull()
  })

  it('enqueueBulkRefreshUserMetricsById refreshes user metrics cache', async () => {
    const user = await createTestUser({ administrator: true })

    await waitForMetricsRefresh(user!.id, () => enqueueBulkRefreshUserMetricsById([user!.id]))

    expect(await caches.user_metrics.get(user!.id)).not.toBeNull()
    expect(await caches.user_metrics.get(user!.username!)).not.toBeNull()
  })
})

async function waitForMetricsRefresh(id: string, enqueue: () => Promise<unknown>): Promise<void> {
  let onCompleted: ((job: Job) => void) | undefined
  const completed = new Promise<void>(resolve => {
    onCompleted = (job: Job) => {
      if ((job.data as { id?: string } | undefined)?.id !== id) return
      resolve()
    }
    entityMetricsCacheRefresh.on('completed', onCompleted)
  })
  try {
    await enqueue()
    await completed
  } finally {
    if (onCompleted) entityMetricsCacheRefresh.off('completed', onCompleted)
  }
}
